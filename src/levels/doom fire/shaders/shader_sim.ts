import { noiseMaths, randMaths } from "./shader_noise";
import { pixelMaths } from "./shader_utils";

export default function shader_simulation(
    device: GPUDevice,
    WORKGROUP_SIZE: number
) {
    return /* wgsl */ `
        //includes
        ${pixelMaths}
        ${noiseMaths}

        fn empty_array(
            data: ptr<storage, array<f32>, read_write>, 
            offset: u32, count: u32) {
            for (var j = 0u; j < count; j++) {
                data[offset + j] = 0;
            }
        }

        fn cellValue(x: u32, y: u32) -> f32 {
            if (x >= u32(grid.x) || x < 0 || y >= u32(grid.y) || y < 0) {return 1f;}
            return cellStateIn[cellIndex(vec2u(x,y))];
        }

        fn getOffset(v: vec2u, offset: vec2i) -> vec2u {
            return vec2u(
                vec2i(v) + offset
            );
        }

        fn mooreIndex(i:u32, offset:vec2i) -> u32 {
            let offsetIndex = u32(offset.y+1) * 3 + u32(offset.x+1);
            return i*9 + offsetIndex;
        }

        //grid dimensions
        @group(0) @binding(0) var<uniform> grid:vec2u; 
        //1 for each cell
        @group(0) @binding(1) var<storage> cellStateIn: array<f32>;
        @group(0) @binding(2) var<storage, read_write> cellStateOut: array<f32>;
        //9 for each cell (itself + each neighbour)
        @group(0) @binding(3) var<storage, read_write> neighbourhood_intent: array<f32>;
        @group(0) @binding(4) var<storage, read_write> neighbourhood_maintain: array<f32>;
        @group(0) @binding(5) var<uniform> time: f32;

        const numPossibilities = 3;
        const outgoingPossibilities = array<vec2i, numPossibilities>(
            vec2i(0,-1),
            vec2i(1,-1),
            vec2i(-1,-1),
        );


        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_push(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            if !computeCellValid(cell, grid) {return;}

            empty_array(&neighbourhood_intent, i*9, 9);

            var fireValue = cellValue(cell.x, cell.y) * 1.0;
            if (cell.y == grid.y - 1) {fireValue = 36;}

            let rand = round(rand11(f32(i)*time) * 2);

            neighbourhood_intent[mooreIndex(i, vec2i(0,1))] = round(max(0,fireValue - f32(u32(rand) & 1u)));

            // let shareSum = shareUpLeft + shareUp + shareUpRight;

            // neighbourhood_intent[mooreIndex(i, vec2i(-1,1))] = fireValue * shareUpLeft/shareSum;
            // neighbourhood_intent[mooreIndex(i, vec2i(0,1))] = fireValue * shareUp/shareSum;
            // neighbourhood_intent[mooreIndex(i, vec2i(1,1))] = fireValue * shareUpRight/shareSum;
        }

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_pull(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            if !computeCellValid(cell, grid) {return;}
    
            empty_array(&neighbourhood_maintain, i*9, 9);
            
            for (var x = -1; x <= 1; x++) {
                for (var y = -1; y <= 1; y++) {
                    if !isWithinBounds(cell.xy, grid) {continue;}
                    let i_neighbour = cellIndex(getOffset(cell.xy, vec2i(x, y)));
                    neighbourhood_maintain[mooreIndex(i, vec2i(x, y))] = neighbourhood_intent[mooreIndex(i_neighbour, vec2i(-x, -y))];
                    neighbourhood_intent[mooreIndex(i_neighbour, vec2i(-x, -y))] = 0;
                }
            }

        }

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_update(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            if !computeCellValid(cell, grid) {return;}

            //sum leftover outgoing intent and accepted incoming intent
            var sum = 0f; 
            for (var x = -1; x <= 1; x++) {
                for (var y = -1; y <= 1; y++) {
                    if !isWithinBounds(cell.xy, grid) {continue;}
                    sum += neighbourhood_maintain[mooreIndex(i, vec2i(x, y))];
                }
            }
            cellStateOut[i] = sum;
        }
    `;
}
