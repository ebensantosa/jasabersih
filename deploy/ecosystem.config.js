// PM2 ecosystem — keep API & Admin running 24/7 dengan auto-restart
module.exports = {
  apps: [
    {
      name: 'jasabersih-api',
      cwd: '/var/www/jasabersih/apps/api',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '500M',
      error_file: '/var/log/jasabersih/api-error.log',
      out_file: '/var/log/jasabersih/api-out.log',
      time: true,
    },
    {
      name: 'jasabersih-admin',
      cwd: '/var/www/jasabersih/apps/admin',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      max_memory_restart: '300M',
      error_file: '/var/log/jasabersih/admin-error.log',
      out_file: '/var/log/jasabersih/admin-out.log',
      time: true,
    },
  ],
};
