import { defineConfig } from '@rsbuild/core';
import { pluginBabel } from '@rsbuild/plugin-babel';
import { pluginSolid } from '@rsbuild/plugin-solid';
import path from 'node:path';

export default defineConfig({
  plugins: [
    pluginBabel({
      include: /\.(?:jsx|tsx)$/,
      exclude: /[\\/]node_modules[\\/]/,
    }),
    pluginSolid(),
  ],
  source: {
    entry: {
      index: './src/index.tsx'
    }
  },
});