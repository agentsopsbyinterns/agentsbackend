const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
  },
  {
    tableName: 'users',
    timestamps: true, // adds createdAt, updatedAt
    indexes: [{ unique: true, fields: ['email'] }],
  }
);

module.exports = User;

