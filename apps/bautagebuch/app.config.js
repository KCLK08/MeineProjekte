const appJson = require('./app.json');

module.exports = () => {
  const expo = { ...appJson.expo };
  const baseUrl = process.env.EXPO_WEB_BASE || '';
  expo.experiments = {
    ...(expo.experiments || {}),
    ...(baseUrl ? { baseUrl } : {}),
  };
  return { expo };
};
