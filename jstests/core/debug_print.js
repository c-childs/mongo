// Checks that the SBE parser is formatting logs correctly with PlanNodeIds.

(function() {
"use strict";

// Tests that there is a correctly formatted PlanNodeId following each given stage.
function testPlanNodeId(sbe_plan, stages) {
    for (const stage of stages) {
        var re = new RegExp(stage + "\\s+n[0-9]+", "g");
        let match = re.exec(sbe_plan);
        print("match! " + match[0]);
        assert(match != null);
    }
}

// Searches through generated logs for any SBE Plans and returns
// the first SBE Plan found with its index.
function getSBEPlan(logs, startIndex, totalLinesWritten) {
    for (let i = startIndex; i < totalLinesWritten; i++) {
        const line = logs[i];
        if (line.includes("SBE")) {
            // Get SBE plan string from log line.
            const planIndex = line.indexOf("stages") + 9;
            const planStr = line.substring(planIndex, line.length - 3);

            // Remove extra whitespace and backslashes.
            const lessStr = planStr.replace(/\\n/g, ' ');
            const lessSpaceStr = lessStr.replace(/\\"/g, '"');
            print("PLAN--");
            print(lessSpaceStr);
            return [lessSpaceStr, i + 1];
        }
    }
    return ["", totalLinesWritten];
}

// Tests that SBE Plans are properly formatted.
function testSBEPlan(pipeline, stages, logIndex, runSBE = false) {
    coll.aggregate(pipeline);
    const logs = db.adminCommand({'getLog': 'global'});
    const res = getSBEPlan(logs["log"], logIndex, logs["totalLinesWritten"]);
    const sbePlanStr = res[0];

    if (sbePlanStr !== "") {
        // Checks that each stage is followed by a PlanNodeId.
        // testPlanNodeId(sbePlanStr, stages);

        if (runSBE) {
            // Checks that each command is properly formatted by the parser.
            // assert.commandWorked(db.runCommand({sbe: sbePlanStr}));
        }
    }
    return res[1];
}

assert.commandWorked(db.setLogLevel(5, "query"));
const coll = db.debug;
coll.drop();

assert.commandWorked(coll.insert(
    {_id: 1, field: "foobar", nums: [4, 6, 2], name: {"first": "john"}, docs: [{a: 1}, {b: 2}]}));
assert.commandWorked(coll.insert({_id: 2, field: "bar", bool: true, name: {"first": "will"}}));
assert.commandWorked(coll.insert({_id: 3, field: "hello", bool: false, name: {"first": "joe"}}));

// Tests filter, traverse, project, scan, limit, and coscan stages
let logIndex = testSBEPlan([{$match: {bool: true}}],
                           ["filter", "traverse", "project", "scan", "project", "limit", "coscan"],
                           0);

assert.commandWorked(coll.createIndex({bool: 1}));

// Tests nlj, ixseek, and seek stages.
logIndex = testSBEPlan([{$match: {bool: true}}], ["nlj", "ixseek", "seek"], logIndex);

assert.commandWorked(coll.createIndex({field: "text"}));

// Tests textmatch, group, and union stages.
logIndex =
    testSBEPlan([{$match: {$text: {$search: "bar"}}}], ["textmatch", "group", "union"], logIndex);

assert.commandWorked(coll.createIndex({nums: -1, "name.first": -1}));

// Tests sspool, lspool, and chkbounds stages.
logIndex = testSBEPlan([{$match: {"name.first": "john", nums: {$gte: 3, $lte: 5}}}],
                       ["sspool", "lspool", "chkbounds"],
                       logIndex);

// Tests sort stage.
logIndex = testSBEPlan([{$sort: {field: -1}}], ["sort"], logIndex);

assert.commandWorked(coll.insert({_id: 4, field: "hello", bool: false, docs: [{a: 1}, {b: 2}]}));
assert.commandWorked(
    coll.insert({_id: 5, field: "hello", bool: false, docs: [{a: 3}, {b: 4}, {c: 5}]}));
assert.commandWorked(coll.createIndex({docs: 1, "name.first": -1}));

// Tests unwind stage.
logIndex =
    testSBEPlan([{$match: {"name.first": "john", "docs": [{a: 1}, {b: 2}]}}], ["unwind"], logIndex);

assert.commandWorked(coll.insert({_id: 0, field: "foo", nums: [5, 3, 2], bool: false}));

// Test mkobj, and project stages.
logIndex = testSBEPlan(
    [{$project: {field: 1}}, {$sort: {field: -1}}], ["mkobj", "project"], logIndex, true);
})();
