const sequelize = require("../config/database")
const User = require("./user")

// Define relationships here if needed

module.exports = {
  sequelize,
  User,
}
