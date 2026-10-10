import path from 'path';
import { app } from 'electron';

/** SmartSub 移植树专用存储根(与宿主 userData 隔离;spec §2) */
export function smartsubUserData(): string {
  return path.join(app.getPath('userData'), 'smartsub');
}
