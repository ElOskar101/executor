git pull --ff-only
npm ci
npm run build
pm2 reload ecosystem.config.js --update-env