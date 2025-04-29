// ecosystem.config.cjs - Using CommonJS format for better compatibility
module.exports = {
    apps: [
      {
        name: 'main-server',
        script: 'src/index.js',
        instances: 1,
        autorestart: true,
        watch: false,
        exec_mode: 'fork',
        interpreter: 'node',
        interpreter_args: '--experimental-specifier-resolution=node'
      },
      {
        name: 'auth-service',
        script: './src/services/authService.js',
        instances: 1,
        autorestart: true,
        watch: false,
        exec_mode: 'fork',
        interpreter: 'node',
        interpreter_args: '--experimental-specifier-resolution=node'
      },
      {
        name: 'subscription-worker',
        script: './src/workers/subscriptionWorker.js',
        instances: 1,
        autorestart: true,
        watch: false,
        exec_mode: 'fork',
        interpreter: 'node',
        interpreter_args: '--experimental-specifier-resolution=node'
      }
    ]
  };