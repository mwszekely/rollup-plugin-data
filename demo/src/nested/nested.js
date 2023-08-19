

import json from "datafile:../test.json?location=asset&mode=json";
import nestedJson from "datafile:./nested.json?location=asset&mode=json";
import rootJsonShouldBeAliased from "datafile:~/root.json?location=asset&mode=json";

(async () => {
    const a = await Promise.all([json, nestedJson, rootJsonShouldBeAliased]);
    console.log(a);
})()
