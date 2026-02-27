const { Sequelize } = require('sequelize');
require('dotenv').config();

// Initialize Sequelize using remote MySQL connection details from .env
const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
    dialect: process.env.DB_DIALECT || 'mysql',
    logging: false,
    dialectOptions: {
      // cPanel hosts usually require SSL disabled for private network,
      // adjust as needed for your provider.
      // ssl: { rejectUnauthorized: false },
    },
  }
);

async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log('Sequelize: Connection to MySQL has been established successfully.');
  } catch (error) {
    console.error('Sequelize: Unable to connect to the database:', error.message);
  }
}

module.exports = { sequelize, testConnection };

