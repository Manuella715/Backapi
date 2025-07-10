const app = require("./index.js"); // ou "./functions/index.js" si tu laisses tout dans functions
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});
