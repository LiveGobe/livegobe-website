module.exports = {
  apps : [{
    name   : "livegobe-website",
    script : "./index.js",
    instances : 6,
    max_memory_restart : "1G",
    exec_mode : "cluster",
    env_production: {
       NODE_ENV: "production"
    },
    env_development: {
       NODE_ENV: "development"
    }
  }]
}
