module.exports = {
  apps : [{
    name   : "livegobe-website",
    script : "./index.js",
    instances : "max",
    exec_mode : "cluster",
    env_production: {
       NODE_ENV: "production"
    },
    env_development: {
       NODE_ENV: "development"
    }
  }]
}
