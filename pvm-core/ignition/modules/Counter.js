const { buildModule } = require("@nomicfoundation/hardhat-ignition/modules");

// Deploy with: hardhat ignition deploy ./ignition/modules/Counter.js
const CounterModule = buildModule("CounterModule", (m) => {
  const counter = m.contract("Counter");
  return { counter };
});

module.exports = CounterModule;
