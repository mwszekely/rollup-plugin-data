import json from "datafile:test.json";
import txt from "datafile:test.txt";
import img from "datafile:test.webp" assert { location: "asset" };

(async () => {
    const a = await Promise.all([txt, json, img]);
    console.log(a);
})()
