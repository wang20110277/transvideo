/**
 * subtitleFormats 严格解析/序列化单元测试。
 *
 * 移植自 SmartSub scripts/test-proofread-load.ts 的 subtitleFormats 部分
 * (前 105 行;该脚本后半段为 types/proofreadData 校验,不属本模块,未随迁)。
 * 断言语义不变:node:assert/strict 的 equal/deepEqual/throws → vitest
 * toBe/toEqual/toThrow。上游为单一脚本顺序执行、首错即停——这里保持单一
 * it() 以忠实保留其失败语义(前面用例失败则后续不执行)。
 */
import { describe, expect, it } from 'vitest';
import {
  parseSubtitleCues,
  parseSubtitleEntries,
  serializeSubtitleCues,
  type SubtitleFormat,
} from '../subtitleFormats';

describe('subtitleFormats:严格解析(strict 模式)', () => {
  it('srt/vtt/ass/lrc 序列化-解析往返与畸形输入拒绝', () => {
    const cue = { startMs: 1000, endMs: 3000, text: 'Original\nsubtitle' };
    const strict = { strict: true };

    // 四格式往返:1 条 cue;空输入与空序列化均解析为空;strict 模式下
    // 尾随残块抛错,非 strict 容忍并保留首条。
    for (const format of ['srt', 'vtt', 'ass', 'lrc'] as SubtitleFormat[]) {
      const content = serializeSubtitleCues([cue], format);
      expect(parseSubtitleEntries(content, format, strict).length).toBe(1);
      expect(parseSubtitleCues('', format, strict)).toEqual([]);
      expect(
        parseSubtitleCues(serializeSubtitleCues([], format), format, strict),
      ).toEqual([]);
      expect(() =>
        parseSubtitleCues(`${content}\n\nBroken subtitle block`, format, strict),
      ).toThrow();
      expect(
        parseSubtitleCues(`${content}\n\nBroken subtitle block`, format).length,
      ).toBe(1);
    }

    // SRT strict:非法时间/时间倒置/重复序号/无时间行/未识别前导内容
    const srt = serializeSubtitleCues([cue], 'srt');
    for (const content of [
      srt.replace('00:00:01,000', 'invalid'),
      srt.replace('00:00:01,000', '00:70:01,000'),
      srt.replace('00:00:01,000', '00:00:61,000'),
      srt.replace('00:00:01,000', '00:00:01,000garbage'),
      srt.replace('00:00:03,000', '00:00:00,000'),
      srt.replace('00:00:03,000', '00:00:01,000'),
      `${srt.trimEnd()}\n${srt}`,
      '1\nBroken timing\nText',
      `Unrecognized preamble\n${srt}`,
    ]) {
      expect(() => parseSubtitleCues(content, 'srt', strict)).toThrow();
    }

    // BOM + CRLF + 空行夹杂:两条均解析
    expect(
      parseSubtitleCues(
        `\ufeff${srt}\n \n${srt}`.replace(/\n/g, '\r\n'),
        'srt',
        strict,
      ).length,
    ).toBe(2);

    // VTT:NOTE/STYLE/REGION 前导块被跳过,cue id + align 参数可解析
    expect(
      parseSubtitleCues(
        'WEBVTT\n\nNOTE Test\nignore\n\nSTYLE\n::cue { color: red }\n\nREGION\nid:one\n\ncue id\n00:01.000 --> 00:03.000 align:start\nText',
        'vtt',
        strict,
      ).length,
    ).toBe(1);

    // VTT strict:缺失 WEBVTT 头抛错;首 cue 时间行丢失(被当 NOTE 吞)抛错
    expect(() =>
      parseSubtitleCues('WEBVTT\n00:01.000 --> 00:03.000\nText', 'vtt', strict),
    ).toThrow();
    expect(() =>
      parseSubtitleCues(
        'WEBVTT\n00:01.000 --> 00:03.000\nLost first cue\n\n00:04.000 --> 00:05.000\nSecond cue',
        'vtt',
        strict,
      ),
    ).toThrow();

    // 空文本 cue 在 srt/vtt/ass 三格式往返中保留
    for (const format of ['srt', 'vtt', 'ass'] as SubtitleFormat[]) {
      const emptyText = serializeSubtitleCues([{ ...cue, text: '' }], format);
      expect(parseSubtitleCues(emptyText, format, strict)).toEqual([
        { ...cue, text: '' },
      ]);
    }

    // ASS strict:缺 Format 头/字段数不符/时间非法/未知行类型
    for (const content of [
      '[Events]\nDialogue: 0,0:00:01.00,0:00:03.00,Text',
      '[Events]\nFormat: Start, End, Text\nDialogue: 0:00:01.00',
      '[Events]\nFormat: Start, End, Text\nDialogue: wrong,0:00:03.00,Text',
      '[Events]\nFormat: Start, End, Text\nDialogue: 0:00:01.00,0:00:03.00,Text\nDialog: broken',
    ]) {
      expect(() => parseSubtitleCues(content, 'ass', strict)).toThrow();
    }

    // LRC:元数据头 + 双时间戳 + 只有时间的尾行(空文本 cue)
    expect(
      parseSubtitleCues(
        '[ar:Artist]\n[offset:100]\n[00:01.00][00:03.00]Text\n[00:06.00]',
        'lrc',
        strict,
      ).length,
    ).toBe(2);
    for (const content of [
      '[00:61.00]Text',
      '[00:01.00][00:bad]Text',
      'Lost text',
    ]) {
      expect(() => parseSubtitleCues(content, 'lrc', strict)).toThrow();
    }
  });
});
