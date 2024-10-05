import { shader_data } from "./shader_data";
import { pixelMaths } from "./shader_utils";

export default function shader_visuals(WORKGROUP_SIZE: number): string {
    return /* wgsl */ `

        ${pixelMaths}
        ${shader_data}

            @compute
            @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
            fn compute_update_visuals(
                @builtin(global_invocation_id) cell: vec3u
            ) {
                //setup
                let frameUpdateCount = updatesInFrame[bindingTag%updatesInFrameArraySize];
                let i = cellIndex(cell.xy);
                let pixel = cellStateIn[i];
                var colour = select(vec4f(0), pixel.colour, pixel.state>0);
                simulationVisualsOut[i] = colour * (1 / f32(frameUpdateCount+1)) + simulationVisualsIn[i] * (f32(frameUpdateCount) / f32(frameUpdateCount+1));
                updatesInFrame[(bindingTag+1)%updatesInFrameArraySize] = frameUpdateCount + 1;
            }
            `;
}
