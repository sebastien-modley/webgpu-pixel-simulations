import { shader_data } from "./shader_data";
import { noiseMaths, perlinMaths } from "./shader_noise";
import { pixelMaths } from "./shader_utils";
import { woodMaths } from "./shader_wood";

export default function shader_visuals(WORKGROUP_SIZE: number): string {
    return /* wgsl */ `

        //includes
        ${pixelMaths}
        ${perlinMaths}
        ${woodMaths}


        ${shader_data}


        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_update_visuals(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            let frameUpdateCount = updatesInFrame[bindingTag%updatesInFrameArraySize];
            //setup
            let i = cellIndex(cell.xy);
            let state = cellStateIn[i];
            let fireColor = calculateRawFireColor(state.fire);
            var color = fireColor;
            if (state.wood > 0) {
                color = overlap_color(getWoodColor(cell.xy), color); 
            }
            // if (updatesInFrame==1) {
            //     simulationVisualsOut[i].colour = color;
            //     return;
            // }
            // else {
            //     var x = 0.9;
            //     simulationVisualsOut[i].colour = (x) * color + (1-x) * simulationVisualsIn[i].colour;
            //     return;
            // }
            simulationVisualsOut[i].colour = color/f32(frameUpdateCount+1) + simulationVisualsIn[i].colour*(f32(frameUpdateCount)/f32(frameUpdateCount+1));
            //updates frame update count
            updatesInFrame[(bindingTag+1)%updatesInFrameArraySize] = frameUpdateCount + 1;
        }


        fn overlap_color(back_color: vec4f, front_color: vec4f) -> vec4f {
            return front_color * front_color.a + back_color * (1 - front_color.a);
        }

        fn calculateRawFireColor(state: f32) -> vec4f {
            if (state < fireColourCheckpoints[0].checkpoint) {return vec4f(0,0,0,0);}
            var color = fireColourCheckpoints[0].colour;
            for (var i = 1; i < fireColourCheckpointsCount; i++) {
                if (state < fireColourCheckpoints[i].checkpoint) {break;}
                color = fireColourCheckpoints[i].colour;
            }
            return vec4f(color.rgb * color.a, color.a);
        } 

        fn getWoodColor(pos: vec2u) -> vec4f{
            let p = (vec2f(pos) - 0.5 * vec2f(grid)) / f32(grid.y);
            return vec4f(matWood(vec3f(p, 1f)), 1f);
        }
    `;
}
