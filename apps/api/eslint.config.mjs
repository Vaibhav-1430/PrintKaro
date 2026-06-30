import { nestjsConfig } from '@print-karo/config-eslint/nestjs';

export default [...nestjsConfig, { ignores: ['dist/**', 'jest.config.cjs'] }];
