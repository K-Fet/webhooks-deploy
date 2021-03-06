function checkEnv(...variables) {
  variables.forEach((t) => {
    if (!process.env[t]) throw new Error(`Empty or missing env property '${t}'! Check your .env file`);
  });
}


module.exports = {
  checkEnv,
};
