import { parseEther } from "ethers";
import fs from "fs";
const main = async () => {
  //read csv file
  const data = fs.readFileSync("./data/distrib.csv", "utf8");
  //split on new line
  const lines = data.split(/\r?\n/);
  //remove header
  lines.shift();
  //split on comma
  const holders = lines.map((line) => line.split(","));
  //remove empty lines
  const filtered = holders.filter((holder) => holder.length > 1);

  const airdrops = [];
  for (const holder of filtered) {
    const airdrop = {
      address: holder[0],
      amount: parseEther(holder[1]).toString(),
    };
    airdrops.push(airdrop);
  }

  fs.writeFileSync("./data/airdrops.json", JSON.stringify(airdrops));
};

main();
