module.exports = {
  apps: [
    {
      name: 'historian-simulator',
      script: 'mqtt_simulator.py',
      interpreter: 'python3',
      cwd: '/var/proyectos/historian/scripts',
      args: '--tokens tokens.json --scan-rate 5',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      log_file: '/var/log/historian-simulator.log',
      out_file: '/var/log/historian-simulator-out.log',
      error_file: '/var/log/historian-simulator-err.log',
      merge_logs: true,
      time: true
    }
  ]
};
