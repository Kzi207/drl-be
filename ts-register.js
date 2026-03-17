// ts-node register file for CommonJS mode
require('ts-node').register({
  transpileOnly: true,
  compilerOptions: {
    module: 'CommonJS',
    target: 'ES2020',
    esModuleInterop: true,
    moduleResolution: 'node',
  }
});
