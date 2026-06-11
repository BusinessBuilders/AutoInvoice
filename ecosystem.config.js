// PM2 process definitions for the AutoInvoice Business OS.
// Usage: pm2 start ecosystem.config.js && pm2 save
// Reboot persistence: run the `pm2 startup` one-liner once (needs sudo).
module.exports = {
  apps: [
    {
      name: 'autoinvoice-backend',
      cwd: __dirname + '/apps/backend',
      script: 'dist/index.js',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 3000,
      out_file: process.env.HOME + '/autoinvoice-backend.log',
      error_file: process.env.HOME + '/autoinvoice-backend.log',
      time: true,
    },
    {
      name: 'autoinvoice-web',
      cwd: __dirname + '/apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start',
      env: { NODE_ENV: 'production' },
      max_restarts: 10,
      restart_delay: 3000,
      out_file: process.env.HOME + '/autoinvoice-web.log',
      error_file: process.env.HOME + '/autoinvoice-web.log',
      time: true,
    },
  ],
};
