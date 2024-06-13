import { Pane } from "tweakpane";
import { reportToUser } from "./utils/util";
import run from "./levels/custom fire - wood/main";
import { setupWebgpu } from "./utils/webgpu/Setup";

const shader = /*wgsl*/ `
@compute
@workgroup_size(1,1,1)
fn compute() {
    result = a + b;
}
`;

const canvas = document.querySelector("canvas");

function handleResize() {}

let { device, context, canvasFormat } = await setupWebgpu(canvas, handleResize);
try {
    run(canvas, device, context, canvasFormat, new Pane({ expanded: true }));
} catch (e) {
    console.error(e);
    console.trace(e);
}
