/**
 * subtitleSegmentation 单元测试。
 *
 * 移植自 SmartSub scripts/test-engine-units.ts 的 subtitleSegmentation 段
 * (上游 L2359-L3322,10 组用例)。用例体逐字保留,仅将上游脚本式
 * 顶层执行改为 it() 分组。断言沿用上游 eq() 语义(JSON.stringify 相等,
 * 失败信息带用例名)——与源完全一致,避免 toEqual 语义漂移。
 */
import { describe, it } from 'vitest';
import {
  tokensToTriples,
  wordsToTriples,
  groupTokenCues,
  getSubtitleCueOptions,
  getMergeShortCueOptions,
  resplitSubtitleCues,
  composeWordCues,
  mergeShortCues,
  enforceMinDisplayDuration,
  clampTriplesToSpeechSegments,
  clampCuesToDominantSegments,
  dropCuesInDeepSilence,
  vadSegmentsToSpeech,
  type TokenTriple,
} from '../subtitleSegmentation';

const T = (a: string, b: string, c: string): TokenTriple => [a, b, c];

function eq(actual: unknown, expected: unknown, name: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) {
    throw new Error(
      `✗ ${name}\n    expected: ${e}\n    actual:   ${a}`,
    );
  }
}

describe('subtitleSegmentation(移植自 test-engine-units.ts)', () => {
  it("tokensToTriples（原生逐 token 毫秒 → 字幕三元组）", () => {
    {
      // 毫秒 t0/t1 → HH:MM:SS,mmm；段间停顿（gap）由原生 segment-aware 映射保留，原样转成 TokenTriple
      eq(
        tokensToTriples([
          { text: '你好', t0: 0, t1: 2000 },
          { text: '世界', t0: 12000, t1: 13000 },
        ]),
        [
          ['00:00:00,000', '00:00:02,000', '你好'],
          ['00:00:12,000', '00:00:13,000', '世界'],
        ],
        'tokensToTriples: ms token times -> SRT triples (native gap preserved)',
      );
      // 时间非法（NaN/缺失）→ 该端输出空串（groupTokenCues 会并入文本、不作为切分依据、不丢字）
      eq(
        tokensToTriples([{ text: 'x', t0: NaN as unknown as number, t1: 500 }]),
        [['', '00:00:00,500', 'x']],
        'tokensToTriples: non-finite start emits empty string (no split, no drop)',
      );
      // 空 / 非数组输入 → 空数组（优雅降级）
      eq(tokensToTriples([]), [], 'tokensToTriples: empty input -> empty output');
    }
  });

  it("vadSegmentsToSpeech + clampTriplesToSpeechSegments", () => {
    {
      // 毫秒 VAD 段 → 秒、排序、丢弃非法段
      eq(
        vadSegmentsToSpeech([
          { t0: 25110, t1: 27140 },
          { t0: 19500, t1: 21510 },
          { t0: 5000, t1: 5000 }, // 非法（end<=start）丢弃
        ]),
        [
          { start: 19.5, end: 21.51 },
          { start: 25.11, end: 27.14 },
        ],
        'vadSegmentsToSpeech: ms->s, sorted, drops invalid',
      );

      const segs = [
        { start: 19.5, end: 21.51 },
        { start: 25.11, end: 27.14 },
      ];
      // token 落在语音段内 → 原样保留；落在段间静音且靠前段 → 收敛到前段末点。
      eq(
        clampTriplesToSpeechSegments(
          [
            T('00:00:20,000', '00:00:21,000', '攝氏'), // 段内
            T('00:00:22,000', '00:00:23,000', '度'), // 静音(21.51-25.11)，中点22.5→近段尾21.51
            T('00:00:26,000', '00:00:26,500', '請'), // 段内
          ],
          segs,
        ),
        [
          ['00:00:20,000', '00:00:21,000', '攝氏'],
          ['00:00:21,510', '00:00:21,510', '度'],
          ['00:00:26,000', '00:00:26,500', '請'],
        ],
        'clampTriplesToSpeechSegments: silence tail token snaps to previous boundary',
      );
      // 夹紧后 group：静音前后被自然间隔切成两条，字幕不糊穿静音
      eq(
        groupTokenCues(
          clampTriplesToSpeechSegments(
            [
              T('00:00:20,800', '00:00:21,000', '溫'),
              T('00:00:23,000', '00:00:24,000', '請'), // 静音中点≈23.5→近段首25.11? 中点距离: 到21.51=1.99,到25.11=1.61→近段首
              T('00:00:26,000', '00:00:26,500', '記'),
            ],
            segs,
          ),
        ).length >= 2,
        true,
        'clamp+group: silence yields a cue split (no spill across silence)',
      );
      // #372 真实公开视频片段：静音后首字「我」的 token 被 whisper 扩展为
      // [上一段末点, 下一段起点]，逐 token 中点就近会把「我」误吸回上一句。
      // 桥接完整静音的内容 token 应归到后段，恢复「通过」/「我这个」的句首归属。
      eq(
        groupTokenCues(
          clampTriplesToSpeechSegments(
            [
              T('00:00:06,130', '00:00:06,400', '通过'),
              T('00:00:06,400', '00:00:23,700', '我'),
              T('00:00:23,700', '00:00:24,030', '这个'),
            ],
            [
              { start: 4.7, end: 6.44 },
              { start: 23.7, end: 25.83 },
            ],
          ),
        ).map((cue) => cue[2]),
        ['通过', '我这个'],
        'clamp+group: full-gap bridge token belongs to following speech segment (#372)',
      );
      // #372 严格回归：同一句的连续 token 被线性摊进数秒静音时，必须按整个 run
      // 归到同一语音段，不能从静音中点劈成「上一句后半 + 下一句前半」。
      const issue372Speech = [
        { start: 0, end: 2 },
        { start: 7, end: 9 },
        { start: 15, end: 17 },
      ];
      const issue372Input = [
        T('00:00:00,200', '00:00:01,800', '语句1。'),
        T('00:00:02,100', '00:00:02,800', '语句2前'),
        T('00:00:04,200', '00:00:04,400', '中'),
        T('00:00:06,700', '00:00:06,950', '后'),
        T('00:00:07,600', '00:00:08,700', '收尾。'),
        T('00:00:09,100', '00:00:09,800', '语句3前'),
        T('00:00:12,200', '00:00:12,400', '中'),
        T('00:00:14,700', '00:00:14,950', '后'),
        T('00:00:15,600', '00:00:16,700', '收尾。'),
      ];
      const issue372Cues = groupTokenCues(
        clampTriplesToSpeechSegments(issue372Input, issue372Speech),
      );
      const issue372Seconds = (value: string) => {
        const parts = value.replace(',', '.').split(':').map(Number);
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
      };
      eq(
        issue372Cues.map((cue) => cue[2]),
        ['语句1。', '语句2前中后收尾。', '语句3前中后收尾。'],
        'clamp+group: long-silence token runs keep complete sentences (#372)',
      );
      eq(
        issue372Cues.map((cue) => [cue[0], cue[1]]),
        [
          ['00:00:00,200', '00:00:01,800'],
          ['00:00:07,000', '00:00:08,700'],
          ['00:00:15,000', '00:00:16,700'],
        ],
        'clamp+group: long-silence cues stay inside their speech segments (#372)',
      );
      eq(
        issue372Cues.every(
          (cue) => issue372Seconds(cue[1]) > issue372Seconds(cue[0]),
        ),
        true,
        'clamp+group: long-silence fix emits no zero-duration cue (#372)',
      );
      eq(
        issue372Cues.map((cue) => cue[2]).join(''),
        issue372Input.map((token) => token[2]).join(''),
        'clamp+group: long-silence fix preserves every token exactly once (#372)',
      );
      // 反向护栏：靠近前段的句尾拖尾字应整体回填前段，不能因为统一前移而变成下一句开头。
      eq(
        groupTokenCues(
          clampTriplesToSpeechSegments(
            [
              T('00:00:49,850', '00:00:49,916', '广'),
              T('00:00:50,090', '00:00:50,400', '泛'),
              T('00:00:53,862', '00:00:54,200', '请'),
            ],
            [
              { start: 44.96, end: 49.916 },
              { start: 53.862, end: 56.76 },
            ],
          ),
        ).map((cue) => cue[2]),
        ['广泛', '请'],
        'clamp+group: trailing token run stays with previous speech segment',
      );
      // 同一静音区同时包含前句尾与后句首时，句末标点必须切断 floating run；
      // 否则整段按后句首的位置前移，会把「结尾。」从前句剥离成后段孤条。
      eq(
        groupTokenCues(
          clampTriplesToSpeechSegments(
            [
              T('00:00:01,000', '00:00:01,900', '前句'),
              T('00:00:02,100', '00:00:02,300', '结尾。'),
              T('00:00:06,800', '00:00:06,950', '后句开头'),
              T('00:00:07,200', '00:00:08,000', '后句'),
            ],
            [
              { start: 0, end: 2 },
              { start: 7, end: 9 },
            ],
          ),
        ).map((cue) => cue[2]),
        ['前句结尾。', '后句开头后句'],
        'clamp+group: sentence end separates opposite floating runs in one gap',
      );
      // 只有起点贴着前段末点的 token 才是原生 VAD 产生的桥接 token；
      // 从前段内部开始的长 token 应按实际最大重叠留在前段。
      eq(
        clampTriplesToSpeechSegments(
          [T('00:00:00,500', '00:00:07,010', '前句长词')],
          [
            { start: 0, end: 2 },
            { start: 7, end: 9 },
          ],
        ),
        [['00:00:00,500', '00:00:02,000', '前句长词']],
        'clamp: only an edge-aligned token can bridge a full VAD gap',
      );
      // 前向 run 必须在后续已锚定 token 之前收尾，不能占满目标语音段后再让时间倒退。
      eq(
        groupTokenCues(
          clampTriplesToSpeechSegments(
            [
              T('00:00:01,000', '00:00:01,900', '前。'),
              T('00:00:04,000', '00:00:05,000', '后句前'),
              T('00:00:06,800', '00:00:06,900', '结束。'),
              T('00:00:07,100', '00:00:07,500', '下一句'),
            ],
            [
              { start: 0, end: 2 },
              { start: 7, end: 9 },
            ],
          ),
        ),
        [
          ['00:00:01,000', '00:00:01,900', '前。'],
          ['00:00:07,000', '00:00:07,100', '后句前结束。'],
          ['00:00:07,100', '00:00:07,500', '下一句'],
        ],
        'clamp+group: forward run reserves time for following anchored token',
      );
      // 独立标点会打断两个 forward run；第二个 run 仍须承接第一个的末点，
      // 不能因为紧邻项是原样保留的标点就从目标段起点重新开始。
      eq(
        groupTokenCues(
          clampTriplesToSpeechSegments(
            [
              T('00:00:01,000', '00:00:01,900', '前。'),
              T('00:00:04,000', '00:00:05,000', '后句'),
              T('00:00:05,100', '00:00:05,200', '。'),
              T('00:00:06,800', '00:00:06,900', '下一句前'),
              T('00:00:07,500', '00:00:08,000', '下一句后'),
            ],
            [
              { start: 0, end: 2 },
              { start: 7, end: 9 },
            ],
          ),
        ),
        [
          ['00:00:01,000', '00:00:01,900', '前。'],
          ['00:00:07,000', '00:00:07,500', '后句。'],
          ['00:00:07,500', '00:00:08,000', '下一句前下一句后'],
        ],
        'clamp+group: punctuation-separated forward runs keep a monotonic cursor',
      );
      // 零时长内容 run 前移到后段起点后，应和后续真实 token 合成非零时长字幕。
      eq(
        groupTokenCues(
          clampTriplesToSpeechSegments(
            [
              T('00:00:36,000', '00:00:36,956', '号'),
              T('00:00:41,400', '00:00:41,400', '人'),
              T('00:00:41,400', '00:00:41,400', '工'),
              T('00:00:41,926', '00:00:43,400', '正在'),
            ],
            [
              { start: 30, end: 36.956 },
              { start: 41.926, end: 44.96 },
            ],
          ),
        ),
        [
          ['00:00:36,000', '00:00:36,956', '号'],
          ['00:00:41,926', '00:00:43,400', '人工正在'],
        ],
        'clamp+group: zero-duration run joins following speech without an orphan cue',
      );
      // 无段信息（VAD 关 / 旧加速包）→ 恒等变换
      eq(
        clampTriplesToSpeechSegments([T('00:00:01,000', '00:00:02,000', 'x')], []),
        [['00:00:01,000', '00:00:02,000', 'x']],
        'clampTriplesToSpeechSegments: no segments -> identity',
      );
    }
  });

  it("clampCuesToDominantSegments + dropCuesInDeepSilence（VAD 关路径）", () => {
    {
      const energy = [
        { start: 14.0, end: 17.0 }, // 句子真正所在段
        { start: 25.0, end: 30.0 },
      ];
      // cue 跨静音糊穿（11→15.5，含 10.9-13.9 静音）：主导段 14-17 覆盖率高 → 整条后移到 14，不碎词
      eq(
        clampCuesToDominantSegments(
          [T('00:00:11,000', '00:00:15,500', '今天是2026年6月25日')],
          energy,
        ),
        [['00:00:14,000', '00:00:15,500', '今天是2026年6月25日']],
        'clampCuesToDominantSegments: cue moves to dominant segment (no word split)',
      );
      // 弱重叠（只擦到段尾 0.2s）→ 不夹（避免夹成碎片），原样保留
      eq(
        clampCuesToDominantSegments(
          [T('00:00:21,000', '00:00:23,000', '请记录以下信息')],
          [
            { start: 19.5, end: 21.2 },
            { start: 25.0, end: 30.0 },
          ],
        ),
        [['00:00:21,000', '00:00:23,000', '请记录以下信息']],
        'clampCuesToDominantSegments: weak overlap left untouched',
      );
      // segments 为空 → 恒等
      eq(
        clampCuesToDominantSegments([T('00:00:01,000', '00:00:02,000', 'x')], []),
        [['00:00:01,000', '00:00:02,000', 'x']],
        'clampCuesToDominantSegments: no segments -> identity',
      );
      // 深静音悬空 cue（离最近段 >1.5s 且零重叠）→ 丢弃；贴边界真实尾字（<1.5s）→ 保留
      eq(
        dropCuesInDeepSilence(
          [
            T('00:00:14,000', '00:00:15,000', '真实'),
            T('00:00:22,000', '00:00:23,000', '幻觉'), // 距段(17/25)>1.5s 且零重叠 → 丢
            T('00:00:17,300', '00:00:17,600', '尾字'), // 距段尾17.0=0.3s → 保留
          ],
          [
            { start: 13.0, end: 17.0 },
            { start: 25.0, end: 30.0 },
          ],
        ),
        [
          ['00:00:14,000', '00:00:15,000', '真实'],
          ['00:00:17,300', '00:00:17,600', '尾字'],
        ],
        'dropCuesInDeepSilence: drops deep-silence hallucination, keeps boundary word',
      );
      // segments 为空 → 原样（优雅降级，绝不无依据删字幕）
      eq(
        dropCuesInDeepSilence([T('00:00:40,000', '00:00:41,000', 'x')], []),
        [['00:00:40,000', '00:00:41,000', 'x']],
        'dropCuesInDeepSilence: no segments -> identity',
      );
    }
  });

  it("groupTokenCues（停顿/句末标点/长度聚合）", () => {
    // 停顿 > 0.5s → 切分成两条
    eq(
      groupTokenCues([
        T('00:00:00,000', '00:00:00,300', '你'),
        T('00:00:00,300', '00:00:00,600', '好'),
        T('00:00:02,000', '00:00:02,300', '世'),
        T('00:00:02,300', '00:00:02,600', '界'),
      ]),
      [
        ['00:00:00,000', '00:00:00,600', '你好'],
        ['00:00:02,000', '00:00:02,600', '世界'],
      ],
      'group: gap > 0.5s splits into two cues',
    );
    // 句末标点 → 收尾当前 cue（标点保留在末尾）
    eq(
      groupTokenCues([
        T('00:00:00,000', '00:00:00,300', '你'),
        T('00:00:00,300', '00:00:00,600', '好'),
        T('00:00:00,600', '00:00:00,900', '。'),
        T('00:00:00,900', '00:00:01,200', '下'),
        T('00:00:01,200', '00:00:01,500', '句'),
      ]),
      [
        ['00:00:00,000', '00:00:00,900', '你好。'],
        ['00:00:00,900', '00:00:01,500', '下句'],
      ],
      'group: sentence-end punctuation flushes the cue',
    );
    // 纯标点 token 不因宽度上限被单切（附在相邻 cue 末尾）
    eq(
      groupTokenCues(
        [
          T('00:00:00,000', '00:00:00,300', '好'),
          T('00:00:00,300', '00:00:00,600', '。'),
        ],
        { maxWidth: 2 },
      ),
      [['00:00:00,000', '00:00:00,600', '好。']],
      'group: punct-only token is not split out by maxWidth',
    );
    // 对照：非标点字符在 maxWidth=2 下确实会被切（证明宽度闸生效、标点是豁免项）
    eq(
      groupTokenCues(
        [
          T('00:00:00,000', '00:00:00,300', '好'),
          T('00:00:00,300', '00:00:00,600', '人'),
        ],
        { maxWidth: 2 },
      ),
      [
        ['00:00:00,000', '00:00:00,300', '好'],
        ['00:00:00,300', '00:00:00,600', '人'],
      ],
      'group: non-punct char splits at maxWidth (contrast)',
    );
    // 空输入 → 空输出
    eq(groupTokenCues([]), [], 'group: empty input -> empty output');
  });

  it("任务级最大字数设置与重断句", () => {
    eq(
      getSubtitleCueOptions({ maxSubtitleChars: 0 }),
      undefined,
      'splitConfig: 0 keeps engine default',
    );
    eq(
      getSubtitleCueOptions({ maxSubtitleChars: 20 }),
      { maxWidth: 20, softMaxWidth: 12 },
      'splitConfig: positive maxSubtitleChars maps to cue width options',
    );
    eq(
      getSubtitleCueOptions({ maxSubtitleChars: 3 }),
      { maxWidth: 8, softMaxWidth: 6 },
      'splitConfig: user value is clamped to readable minimum',
    );
    // -1 =「不限制长度」：关闭宽度硬切（仅按停顿/标点/时长断句），合并上限同步放开，
    // 段级兜底重拆不生效（原生断句本就不按宽度硬切）。
    eq(
      getSubtitleCueOptions({ maxSubtitleChars: -1 }),
      { maxWidth: Number.POSITIVE_INFINITY },
      'splitConfig: -1 (unlimited) disables width hard cut',
    );
    eq(
      getMergeShortCueOptions({ maxSubtitleChars: -1 }),
      { maxWidth: Number.POSITIVE_INFINITY },
      'splitConfig: -1 (unlimited) lifts merge width cap',
    );
    eq(
      resplitSubtitleCues([T('0', '5', '一二三四五六七八九十')], {
        maxSubtitleChars: -1,
      }),
      [['0', '5', '一二三四五六七八九十']],
      'splitConfig: -1 (unlimited) keeps segment-level cues unsplit',
    );
    eq(
      groupTokenCues(
        wordsToTriples([
          { start: 0, end: 0.3, word: 'Hello ' },
          { start: 0.3, end: 0.6, word: 'world ' },
          { start: 0.6, end: 0.9, word: 'again ' },
          { start: 0.9, end: 1.2, word: 'today' },
        ]),
        { maxWidth: 12, softMaxWidth: 8 },
      ),
      [
        ['00:00:00,000', '00:00:00,600', 'Hello world'],
        ['00:00:00,600', '00:00:01,200', 'again today'],
      ],
      'splitConfig: word-level timestamps rebuild long English subtitles by width',
    );
    eq(
      resplitSubtitleCues([T('0', '5', '一二三四五六七八九十')], {
        maxSubtitleChars: 8,
      }),
      [
        ['00:00:00,000', '00:00:02,000', '一二三四'],
        ['00:00:02,000', '00:00:04,000', '五六七八'],
        ['00:00:04,000', '00:00:05,000', '九十'],
      ],
      'splitConfig: segment-level fallback splits long CJK cue proportionally',
    );
    // 文本级兜底与 token 级硬切回溯共享同一份可断标点（含顿号）：切在「、」后而非句中。
    eq(
      resplitSubtitleCues([T('0', '8', '一二、三四五六七')], {
        maxSubtitleChars: 8,
      }),
      [
        ['00:00:00,000', '00:00:03,000', '一二、'],
        ['00:00:03,000', '00:00:07,000', '三四五六'],
        ['00:00:07,000', '00:00:08,000', '七'],
      ],
      'splitConfig: text fallback breaks after dunhao (shared punct set)',
    );
    // 文本级兜底第二级断点：无标点可断且直切会拆词（我们的人|工智能）→ 回退词边界
    // （Intl.Segmenter：我们|的|人工|智能）→「我们的|人工智能」，时间按宽度比例插值。
    eq(
      resplitSubtitleCues([T('0', '7', '我们的人工智能')], {
        maxSubtitleChars: 8,
      }),
      [
        ['00:00:00,000', '00:00:03,000', '我们的'],
        ['00:00:03,000', '00:00:07,000', '人工智能'],
      ],
      'splitConfig: text fallback backtracks to word boundary (no mid-word split)',
    );
    // composeWordCues 统一出口：词级三元组 + 任务级上限 → group(含硬切回溯)+merge+minDisplay。
    eq(
      composeWordCues(
        wordsToTriples([
          { start: 0, end: 0.3, word: 'Hello ' },
          { start: 0.3, end: 0.6, word: 'world ' },
          { start: 0.6, end: 0.9, word: 'again ' },
          { start: 0.9, end: 1.2, word: 'today' },
        ]),
        { maxSubtitleChars: 12 },
      ),
      [
        ['00:00:00,000', '00:00:00,600', 'Hello world'],
        ['00:00:00,600', '00:00:01,200', 'again today'],
      ],
      'splitConfig: composeWordCues applies user width on word timestamps',
    );
    // 未设上限（0/缺省）→ 引擎默认断句（单条，不受用户宽度影响）。
    eq(
      composeWordCues(
        wordsToTriples([
          { start: 0, end: 0.3, word: 'Hello ' },
          { start: 0.3, end: 0.6, word: 'world ' },
          { start: 0.6, end: 0.9, word: 'again ' },
          { start: 0.9, end: 1.2, word: 'today' },
        ]),
        { maxSubtitleChars: 0 },
      ),
      [['00:00:00,000', '00:00:01,200', 'Hello world again today']],
      'splitConfig: composeWordCues keeps engine defaults when limit unset',
    );
    // -1（不限制长度）对比默认档：同一段 25 汉字（宽度 50）无标点无停顿语流，
    // 默认档被 40 宽度兜底切开，-1 保持单条（只按停顿/标点/时长断句）。
    {
      const longTokens = [
        T('0', '0.5', '这是一段很'),
        T('0.5', '1', '长很长的没'),
        T('1', '1.5', '有任何标点'),
        T('1.5', '2', '的中文语音'),
        T('2', '2.5', '内容示例哦'),
      ];
      eq(
        composeWordCues(longTokens, { maxSubtitleChars: 0 }).length > 1,
        true,
        'splitConfig: default 40-width guard still splits punctless stream (contrast)',
      );
      eq(
        composeWordCues(longTokens, { maxSubtitleChars: -1 }),
        [
          [
            '00:00:00,000',
            '00:00:02,500',
            '这是一段很长很长的没有任何标点的中文语音内容示例哦',
          ],
        ],
        'splitConfig: -1 (unlimited) keeps punctless stream as one cue',
      );
    }
  });

  it("硬切回溯到最近可断标点（避免孤立句尾词）", () => {
    // 宽度超限时不在「当前词前」切，而是回溯到 cue 内最后一个可断标点后切；
    // 余部（真实词级时间）作新 cue 开头。「甲乙，丙」+丁 超宽 → 「甲乙，」|「丙丁戊」。
    eq(
      groupTokenCues(
        [
          T('0', '0.3', '甲'),
          T('0.3', '0.6', '乙'),
          T('0.6', '0.9', '，'),
          T('0.9', '1.2', '丙'),
          T('1.2', '1.5', '丁'),
          T('1.5', '1.8', '戊'),
        ],
        { maxWidth: 8 },
      ),
      [
        ['00:00:00,000', '00:00:00,900', '甲乙，'],
        ['00:00:00,900', '00:00:01,800', '丙丁戊'],
      ],
      'group: hard-cut backtracks to last breakable punct (comma)',
    );
    // 顿号不参与软切（枚举保护），但硬切被迫分割时参与回溯——切在顿号后优于切在词中。
    eq(
      groupTokenCues(
        [
          T('0', '0.3', '甲'),
          T('0.3', '0.6', '乙'),
          T('0.6', '0.9', '、'),
          T('0.9', '1.2', '丙'),
          T('1.2', '1.5', '丁'),
          T('1.5', '1.8', '戊'),
        ],
        { maxWidth: 8 },
      ),
      [
        ['00:00:00,000', '00:00:00,900', '甲乙、'],
        ['00:00:00,900', '00:00:01,800', '丙丁戊'],
      ],
      'group: hard-cut backtracks at dunhao (excluded from soft cut only)',
    );
    // 句内无可断标点、直切处恰为词边界（甲乙丙丁|戊）→ 与回溯前行为一致（在当前词前切）。
    eq(
      groupTokenCues(
        [
          T('0', '0.3', '甲'),
          T('0.3', '0.6', '乙'),
          T('0.6', '0.9', '丙'),
          T('0.9', '1.2', '丁'),
          T('1.2', '1.5', '戊'),
        ],
        { maxWidth: 8 },
      ),
      [
        ['00:00:00,000', '00:00:01,200', '甲乙丙丁'],
        ['00:00:01,200', '00:00:01,500', '戊'],
      ],
      'group: hard-cut without punct falls back to cut-before-token',
    );
    // 第二级回退：无标点且直切会把「不错」从 token 缝拆开（…很不|错）→ 回溯到
    // 词边界对齐的 token 边界（Intl.Segmenter：今天|天气|很|不错）→「今天天气很|不错」。
    eq(
      groupTokenCues(
        [
          T('0', '0.3', '今天'),
          T('0.3', '0.6', '天气'),
          T('0.6', '0.9', '很'),
          T('0.9', '1.2', '不'),
          T('1.2', '1.5', '错'),
        ],
        { maxWidth: 12 },
      ),
      [
        ['00:00:00,000', '00:00:00,900', '今天天气很'],
        ['00:00:00,900', '00:00:01,500', '不错'],
      ],
      'group: hard-cut backtracks to word boundary (no mid-word split)',
    );
    // 余部并入本 token 后仍超宽 → 余部单独成条（任何 cue 不超宽；单字余部交 mergeShortCues 回收）。
    eq(
      groupTokenCues(
        [
          T('0', '0.3', '甲'),
          T('0.3', '0.6', '，'),
          T('0.6', '0.9', '乙'),
          T('0.9', '1.2', '丙丙丙丙'),
        ],
        { maxWidth: 8 },
      ),
      [
        ['00:00:00,000', '00:00:00,600', '甲，'],
        ['00:00:00,600', '00:00:00,900', '乙'],
        ['00:00:00,900', '00:00:01,200', '丙丙丙丙'],
      ],
      'group: rest still over limit -> rest flushed alone (never overflow)',
    );
    // 英文（拉丁词带前置空格）同样回溯：逗号后分割，余部起点取真实词时间。
    eq(
      groupTokenCues(
        [
          T('0', '0.35', ' aaaa'),
          T('0.4', '0.75', ' bb,'),
          T('0.8', '1.15', ' cc'),
          T('1.2', '1.55', ' dddd'),
        ],
        { maxWidth: 12 },
      ),
      [
        ['00:00:00,000', '00:00:00,750', 'aaaa bb,'],
        ['00:00:00,800', '00:00:01,550', 'cc dddd'],
      ],
      'group: hard-cut backtracks at latin comma with real word times',
    );
    // 真实回归（ASR ZH Longgap 阿里云词级结果原样）：整句超 20 汉字且句内仅有顿号 →
    // 回溯到顿号切，不再产出孤立的「广泛。」尾词条。
    eq(
      groupTokenCues([
        T('44.701', '45.212', '语音'),
        T('45.212', '45.722', '识别、'),
        T('45.722', '46.743', '机器翻译'),
        T('46.743', '46.998', '和'),
        T('46.998', '48.018', '自然语言'),
        T('48.018', '48.529', '处理'),
        T('48.529', '49.039', '应用'),
        T('49.039', '49.549', '十分'),
        T('49.549', '50.060', '广泛。'),
      ]),
      [
        ['00:00:44,701', '00:00:45,722', '语音识别、'],
        ['00:00:45,722', '00:00:50,060', '机器翻译和自然语言处理应用十分广泛。'],
      ],
      'group: real aliyun longgap sentence splits at dunhao, no orphan tail word',
    );
  });

  it("§6.2 标点优先软切 + 前导标点归属", () => {
    // 软切：cue 达软宽度后，在停顿性标点（，）处断句（softMaxWidth 默认 10）。
    // 「今天是晴天」=10 + 「，」 → 收尾；「心情好」另起一条。
    eq(
      groupTokenCues([
        T('0', '0.3', '今'),
        T('0.3', '0.6', '天'),
        T('0.6', '0.9', '是'),
        T('0.9', '1.2', '晴'),
        T('1.2', '1.5', '天'),
        T('1.5', '1.8', '，'),
        T('1.8', '2.1', '心'),
        T('2.1', '2.4', '情'),
        T('2.4', '2.7', '好'),
      ]),
      [
        ['00:00:00,000', '00:00:01,800', '今天是晴天，'],
        ['00:00:01,800', '00:00:02,700', '心情好'],
      ],
      'group(§6.2): soft-split at comma once cue reaches soft width',
    );
    // 不过碎：未达软宽度的短逗号短语保持一条（「好，的」宽度 5 < 10，不软切）。
    eq(
      groupTokenCues([
        T('0', '0.3', '好'),
        T('0.3', '0.6', '，'),
        T('0.6', '0.9', '的'),
      ]),
      [['00:00:00,000', '00:00:00,900', '好，的']],
      'group(§6.2): short comma phrase below soft width stays one cue',
    );
    // 顿号保护：「、」不参与软切，电话号/枚举不被切碎（宽度已 > softMaxWidth 仍不切）。
    eq(
      groupTokenCues([
        T('0', '0.3', '壹'),
        T('0.3', '0.6', '贰'),
        T('0.6', '0.9', '叁'),
        T('0.9', '1.2', '肆'),
        T('1.2', '1.5', '伍'),
        T('1.5', '1.8', '、'),
        T('1.8', '2.1', '陆'),
        T('2.1', '2.4', '柒'),
      ]),
      [['00:00:00,000', '00:00:02,400', '壹贰叁肆伍、陆柒']],
      'group(§6.2): ideographic comma does NOT trigger soft-split (keeps numbers/lists intact)',
    );
    // 软切（时长闸）：宽度不够但时长达 softMaxDuration（2.5s）后遇逗号也切。
    eq(
      groupTokenCues([
        T('0', '1.4', '啊'),
        T('1.4', '2.8', '，'),
        T('2.8', '3.2', '好'),
      ]),
      [
        ['00:00:00,000', '00:00:02,800', '啊，'],
        ['00:00:02,800', '00:00:03,200', '好'],
      ],
      'group(§6.2): soft-split by duration gate when width is small',
    );
    // 前导标点归属：gap 后以标点开头的 token → 贴回上一条末尾，不另起以「，」开头的条。
    eq(
      groupTokenCues([
        T('0', '0.3', '甲'),
        T('0.3', '0.6', '乙'),
        T('2.0', '2.3', '，'),
        T('2.3', '2.6', '丙'),
        T('2.6', '2.9', '丁'),
      ]),
      [
        ['00:00:00,000', '00:00:00,600', '甲乙，'],
        ['00:00:02,300', '00:00:02,900', '丙丁'],
      ],
      'group(§6.2): leading punctuation after a gap attaches to previous cue',
    );
    // 软切不影响句末标点：句末标点仍立即切（与软宽度无关）。
    eq(
      groupTokenCues([
        T('0', '0.3', '好'),
        T('0.3', '0.6', '。'),
        T('0.6', '0.9', '走'),
      ]),
      [
        ['00:00:00,000', '00:00:00,600', '好。'],
        ['00:00:00,600', '00:00:00,900', '走'],
      ],
      'group(§6.2): sentence-end still flushes immediately regardless of soft width',
    );
  });

  it("tokensToTriples + group 端到端（原生 segment-aware token 已带停顿）", () => {
    {
      // 原生层已把段间静音映射成 token gap（前段止于 2.0s、后段起于 12.0s）→ group 在此 gap 切两条，
      // 停顿天然复现（取代旧 retime+group：不再需要外部语音段把 token 贴回有声区间）。
      const native = [
        { text: '前', t0: 0, t1: 1000 },
        { text: '段', t0: 1000, t1: 2000 },
        { text: '后', t0: 12000, t1: 12300 },
        { text: '段', t0: 12300, t1: 12600 },
      ];
      eq(
        groupTokenCues(tokensToTriples(native)),
        [
          ['00:00:00,000', '00:00:02,000', '前段'],
          ['00:00:12,000', '00:00:12,600', '后段'],
        ],
        'tokensToTriples+group: native segment-aware gap splits into two cues',
      );
    }
  });

  it("mergeShortCues（弱模型/VAD 误切的单字碎片并回相邻条，§6.2 D10）", () => {
    {
      // 复现用户反馈：「廣」「泛」被亚秒级假停顿切成单字两条 → 并回一条「廣泛。」
      eq(
        mergeShortCues([
          T('00:00:49,000', '00:00:49,300', '廣'),
          T('00:00:49,900', '00:00:50,200', '泛。'),
        ]),
        [['00:00:49,000', '00:00:50,200', '廣泛。']],
        'merge: single-char fragments across sub-second false gap join into previous',
      );
      // 真实停顿（数秒）隔开的短 cue → 不并（不跨越真实停顿桥接）
      eq(
        mergeShortCues([
          T('00:00:10,000', '00:00:10,300', '好'),
          T('00:00:15,000', '00:00:15,300', '走'),
        ]),
        [
          ['00:00:10,000', '00:00:10,300', '好'],
          ['00:00:15,000', '00:00:15,300', '走'],
        ],
        'merge: short cues separated by a real (multi-second) pause are kept',
      );
      // 足够宽的正常 cue → 原样（仅碎片才并）
      eq(
        mergeShortCues([
          T('00:00:00,000', '00:00:01,000', '大家好'),
          T('00:00:01,000', '00:00:02,000', '歡迎使用'),
        ]),
        [
          ['00:00:00,000', '00:00:01,000', '大家好'],
          ['00:00:01,000', '00:00:02,000', '歡迎使用'],
        ],
        'merge: cues at/above minWidth are left untouched',
      );
      // 连续多个单字碎片 → 级联并入同一条
      eq(
        mergeShortCues([
          T('0', '0.3', '一'),
          T('0.5', '0.8', '二'),
          T('1.0', '1.3', '三'),
        ]),
        [['00:00:00,000', '00:00:01,300', '一二三']],
        'merge: consecutive single-char fragments cascade into one cue',
      );
      // 首条即碎片且无上一条 → 原样保留（无处可并）
      eq(
        mergeShortCues([T('0', '0.3', '甲')]),
        [['00:00:00,000', '00:00:00,300', '甲']],
        'merge: leading lone fragment with no previous cue kept as-is',
      );
      // 并入后会超 maxWidth → 不并，保留碎片（避免超长 cue）
      eq(
        mergeShortCues([T('0', '1.0', '滿'), T('1.1', '1.4', '字')], {
          minContentChars: 1,
          maxWidth: 2,
        }),
        [
          ['00:00:00,000', '00:00:01,000', '滿'],
          ['00:00:01,100', '00:00:01,400', '字'],
        ],
        'merge: skip when joined width would exceed maxWidth',
      );
      // 阿拉伯文等非 ASCII 字母也属于实义字符，完整词不能被误判成碎片并回上一条。
      eq(
        mergeShortCues([T('0', '1.0', 'عيون'), T('1.0', '1.4', 'ماما.')]),
        [
          ['00:00:00,000', '00:00:01,000', 'عيون'],
          ['00:00:01,000', '00:00:01,400', 'ماما.'],
        ],
        'merge: Arabic words are not misclassified as short fragments',
      );
    }
  });

  it("enforceMinDisplayDuration（最短可读显示时长护栏，D15）", () => {
    {
      // 过短 cue（0.5s < 0.8 硬下限）→ 末点延进其后空隙到 0.8s；够长的下一条不动
      eq(
        enforceMinDisplayDuration([
          T('00:00:10,000', '00:00:10,500', '短'),
          T('00:00:13,000', '00:00:16,000', '這是一條足夠長的字幕'),
        ]),
        [
          ['00:00:10,000', '00:00:10,800', '短'],
          ['00:00:13,000', '00:00:16,000', '這是一條足夠長的字幕'],
        ],
        'minDisplay: too-short cue end extended into following gap (hard floor)',
      );
      // 文本长但时长短（JA 实测 19~22 字 0.5s）→ 按实义字符数缩放 desired=20×0.06=1.2s
      const longCjk = 'あ'.repeat(20);
      eq(
        enforceMinDisplayDuration([
          T('00:00:10,000', '00:00:10,400', longCjk),
          T('00:00:14,000', '00:00:17,000', '後文'),
        ]),
        [
          ['00:00:10,000', '00:00:11,200', longCjk],
          ['00:00:14,000', '00:00:17,000', '後文'],
        ],
        'minDisplay: long-text short-duration cue scaled by content char count',
      );
      // 延长封顶在「下一条起点 − guardGap(0.1)」（EN 实测下一条很近 → 只能部分改善）
      eq(
        enforceMinDisplayDuration([
          T('00:00:40,000', '00:00:40,280', '字幕'),
          T('00:00:40,600', '00:00:42,000', '後面一條較長字幕'),
        ]),
        [
          ['00:00:40,000', '00:00:40,500', '字幕'],
          ['00:00:40,600', '00:00:42,000', '後面一條較長字幕'],
        ],
        'minDisplay: extension capped at next-start minus guard gap',
      );
      // 下一条过近（无空隙可延）→ 原样，绝不与下一条重叠
      eq(
        enforceMinDisplayDuration([
          T('00:00:40,000', '00:00:40,500', '字幕'),
          T('00:00:40,550', '00:00:42,000', '緊鄰下一條'),
        ]),
        [
          ['00:00:40,000', '00:00:40,500', '字幕'],
          ['00:00:40,550', '00:00:42,000', '緊鄰下一條'],
        ],
        'minDisplay: next cue too close leaves cue unchanged (no overlap)',
      );
      // 末条（其后无可解析起点）→ 不延长（纯函数无音频总长，交给 trim 兜底）
      eq(
        enforceMinDisplayDuration([T('00:00:10,000', '00:00:10,300', '短')]),
        [['00:00:10,000', '00:00:10,300', '短']],
        'minDisplay: last cue not extended (pure fn has no audio length)',
      );
      // 空输入 → 空
      eq(
        enforceMinDisplayDuration([]),
        [],
        'minDisplay: empty input returns empty',
      );
      // 已足够长的 cue → 仅规范化时间，不延长
      eq(
        enforceMinDisplayDuration([T('5', '8.5', '足夠長')]),
        [['00:00:05,000', '00:00:08,500', '足夠長']],
        'minDisplay: already-long cue normalized but not extended',
      );
      // 时间不可解析 → 原样返回（不臆断）
      eq(
        enforceMinDisplayDuration([T('bad', 'x', 'y')]),
        [['bad', 'x', 'y']],
        'minDisplay: unparseable cue returned as-is',
      );
      // perCharSeconds=0 关闭按长度缩放 → 仅用硬下限 0.8s（20 字也只到 0.8s）
      eq(
        enforceMinDisplayDuration(
          [
            T('00:00:10,000', '00:00:10,400', longCjk),
            T('00:00:14,000', '00:00:17,000', '後文'),
          ],
          { perCharSeconds: 0 },
        ),
        [
          ['00:00:10,000', '00:00:10,800', longCjk],
          ['00:00:14,000', '00:00:17,000', '後文'],
        ],
        'minDisplay: perCharSeconds=0 uses only the hard floor',
      );
      // 可配置硬下限（minDurationSeconds=1.5）
      eq(
        enforceMinDisplayDuration(
          [
            T('00:00:10,000', '00:00:10,500', '短'),
            T('00:00:20,000', '00:00:23,000', '後'),
          ],
          { minDurationSeconds: 1.5 },
        ),
        [
          ['00:00:10,000', '00:00:11,500', '短'],
          ['00:00:20,000', '00:00:23,000', '後'],
        ],
        'minDisplay: configurable minDurationSeconds floor',
      );
    }
  });

});
