import { pixelMaths } from "./shader_utils";

export default function shader_simulation(
    device: GPUDevice,
    WORKGROUP_SIZE: number
) {
    return /* wgsl */ `
        //includes
        ${pixelMaths}

        fn empty_array(
            data: ptr<storage, array<u32>, read_write>, 
            offset: u32, count: u32) {
            for (var j = 0u; j < count; j++) {
                data[offset + j] = 0;
            }
        }

        fn cellValue(x: u32, y: u32) -> u32 {
            if (x >= u32(grid.x) || x < 0 || y >= u32(grid.y) || y < 0) {return 1;}
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
        @group(0) @binding(0) var<uniform> grid:vec2f; 
        //1 for each cell
        @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
        @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;
        //9 for each cell (itself + each neighbour)
        @group(0) @binding(3) var<storage, read_write> neighbourhood_intent: array<u32>;
        @group(0) @binding(4) var<storage, read_write> neighbourhood_maintain: array<u32>;


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
            empty_array(&neighbourhood_intent, i*9, 9);

            //empty? do nothing!
            if cellValue(cell.x, cell.y) == 0 {
                return;
            }

            for (var j = 0; j < numPossibilities; j++) {
                let offset = outgoingPossibilities[j];
                let out_cell = getOffset(cell.xy, offset);
                //neighbour is free - declare takeover intent!
                if cellValue(out_cell.x, out_cell.y) == 0 {
                    neighbourhood_intent[mooreIndex(i, offset)] = 1;
                    return;
                }
            }
            //nevermind... re-assign to self
            neighbourhood_intent[mooreIndex(i, vec2i(0,0))] = 1;
        }

        @compute
        @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE}, 1)
        fn compute_pull(
            @builtin(global_invocation_id) cell: vec3u
        ) {
            //setup
            let i = cellIndex(cell.xy);
            empty_array(&neighbourhood_maintain, i*9, 9);
            
            if neighbourhood_intent[mooreIndex(i, vec2i(0,0))] == 1 {
                return; //we're staying in place
            }

            for (var j = 0; j < numPossibilities; j++) {
                let offset = outgoingPossibilities[j];
                let i_in = cellIndex(getOffset(cell.xy, -offset));
                //if receiving intent, accept it
                if neighbourhood_intent[mooreIndex(i_in, offset)] == 1 {
                    neighbourhood_intent[mooreIndex(i_in, offset)] = 0;
                    neighbourhood_maintain[mooreIndex(i, -offset)] = 1;
                    return;
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

            //sum leftover outgoing intent and accepted incoming intent
            var sum = neighbourhood_intent[mooreIndex(i, vec2i(0,0))];
            for (var j = 0; j < numPossibilities; j++) {
                let offset = outgoingPossibilities[j];
                sum += neighbourhood_intent[mooreIndex(i, offset)];
                sum += neighbourhood_maintain[mooreIndex(i, -offset)];
            }
            cellStateOut[i] = sum;
        }
    `;
}
