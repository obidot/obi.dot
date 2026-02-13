const hre = require("hardhat");
const { expect } = require("chai");

describe("Counter", function () {
  // ⚠️ Note: `loadFixture` does not currently work with Polkadot.
  async function deployCounterFixture() {
    const [deployer] = await hre.ethers.getSigners();
    const counterFactory = await hre.ethers.getContractFactory("Counter");
    const counter = await counterFactory.connect(deployer).deploy();
    return { counter, deployer };
  }

  it("Should start with number equal to 0", async function () {
    const { counter } = await deployCounterFixture();
    expect(await counter.number()).to.equal(0);
  });

  it("Should set the number", async function () {
    const { counter } = await deployCounterFixture();
    await counter.setNumber(42);
    expect(await counter.number()).to.equal(42);
  });

  it("Should increment the number", async function () {
    const { counter } = await deployCounterFixture();
    await counter.setNumber(0);
    await counter.increment();
    expect(await counter.number()).to.equal(1);
  });
});
