module.exports = (api) => {
  const isProduction = api.env("production");
  
  return {
    presets: ["module:@react-native/babel-preset"],
    plugins: [
      [
        "module:react-native-dotenv",
        {
          envName: "APP_ENV",
          moduleName: "@env",
          path: ".env",
          safe: false,
          allowUndefined: true,
        },
      ],
      // Remove console.* in production builds for better performance
      isProduction && "transform-remove-console",
    ].filter(Boolean),
  };
};
