import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Test files share one MySQL database and each resets it in beforeEach,
    // so files must run one at a time rather than Vitest's default of
    // spreading them across parallel workers.
    fileParallelism: false,
  },
});
