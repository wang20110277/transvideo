module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'electron/services/smartsub/**'],
  parser: '@typescript-eslint/parser',
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
  },
  overrides: [
    {
      // renderer 值导入防护:src/ 只允许经 @smartsub/* 做 type-only 导入
      // (运行期擦除,不会把主进程代码拖进 renderer bundle);
      // electron/ 主进程的 '@smartsub/bridge' 实体导入不受此条约束
      files: ['src/**/*.{ts,tsx}'],
      rules: {
        // 用 @typescript-eslint 增强版:core 规则(v8.57)的 patterns 条目
        // 不支持 allowTypeImports,增强版在 paths/patterns 均支持
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@smartsub/*'],
                message:
                  'renderer 禁止从移植树值导入——只允许 import type(经 src/types/smartsub.ts 消费)',
                allowTypeImports: true,
              },
            ],
          },
        ],
      },
    },
  ],
}
