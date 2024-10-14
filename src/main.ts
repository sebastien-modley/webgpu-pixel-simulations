import { Pane } from "tweakpane";
import { reportToUser } from "./utils/util";
import run from "./levels/custom fire - wood/main";
import sandrun from "./levels/sand simulation/main";
import { setupWebgpu } from "./utils/webgpu/Setup";
import gol from "./levels/game of life/main";
import sand_run_remake from "./levels/sand simulation remade/main";
import doom_fire from "./levels/doom fire - wood/main";

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
    // sandrun(device, context, canvasFormat);
    // run(canvas, device, context, canvasFormat, new Pane({ expanded: true }));
    sand_run_remake(
        canvas,
        device,
        context,
        canvasFormat,
        new Pane({ expanded: true })
    );
    // doom_fire(canvas, device, context, canvasFormat, new Pane({ expanded: true }));
    // doom_fire(device, context, canvasFormat);
} catch (e) {
    console.error(e);
    console.trace(e);
}
