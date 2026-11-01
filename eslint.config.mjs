import next from 'eslint-config-next';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  ...next,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      '@next/next/no-img-element': 'off',
      'react-hooks/exhaustive-deps': 'warn',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/static-components': 'off',
    },
  },
];
