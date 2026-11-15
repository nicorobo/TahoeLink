<script lang="ts">
  import { getCellBorderClasses } from '$lib/utils/border'
  import { getCellBackgroundClass } from '$lib/utils/color'
  import { tryPlacePiece } from '@tahoelink/shared'

  const PLAYER_COLORS = ['bg-red-400', 'bg-blue-400', 'bg-amber-400', 'bg-green-400']
  const getPlayerColor = (id: number) => PLAYER_COLORS[Math.min(id, 3)]

  let {
    board,
    onClick,
    shape,
    legalColumns,
    playerId,
    disabled,
  }: {
    board: number[][]
    onClick: (col: number) => void
    shape: number[][]
    legalColumns: number[]
    playerId: number | null
    disabled?: boolean
  } = $props()

  let hoveredColumn = $state<number | null>(null)

  let ghostCellSet = $derived(
    hoveredColumn !== null
    && playerId !== null
    && legalColumns?.includes(hoveredColumn)
    && shape
      ? new Set(
          (tryPlacePiece({ board, column: hoveredColumn, shape, shapeId: playerId ?? 0 })?.cells ?? []).map(
            ([x, y]) => `${x},${y}`
          )
        )
      : new Set()
  )

  const getCellOwnerDisplay = (cell: number): string => {
    if (cell < 0) return ''
    return String(Math.floor(cell / 1000) + 1)
  }

  const getCellAriaLabel = (colIdx: number, rowIdx: number, cell: number): string => {
    const pos = `Column ${colIdx + 1}, Row ${rowIdx + 1}`
    if (cell < 0) return `${pos}, empty`
    return `${pos}, Player ${Math.floor(cell / 1000) + 1}`
  }
</script>

<div class="max-w-full overflow-auto" role="group" aria-label="Game board">
  <div class="flex gap-0 {disabled ? 'pointer-events-none opacity-70' : ''}">
    {#each board as column, colIdx}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        class="flex flex-col {legalColumns?.includes(colIdx) === false ? 'opacity-50' : ''}"
        onmouseenter={() => hoveredColumn = colIdx}
        onmouseleave={() => hoveredColumn = null}
      >
        {#each column as cell, rowIdx}
          {@const isGhost = ghostCellSet.has(`${colIdx},${rowIdx}`)}
          {@const owner = getCellOwnerDisplay(cell)}
          <button
            class="w-10 h-10 max-sm:w-8 max-sm:h-8 {isGhost ? getPlayerColor(playerId ?? 0) : getCellBackgroundClass(cell)} {isGhost ? 'opacity-30' : ''} hover:bg-gray-300 active:bg-gray-400 border border-gray-100 {getCellBorderClasses(board, cell, colIdx, rowIdx)} focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            aria-label={getCellAriaLabel(colIdx, rowIdx, cell)}
            onclick={() => { if (!disabled) onClick(colIdx) }}
            disabled={disabled ?? false}
          ><span class="text-[10px] text-black/60">{owner}</span></button>
        {/each}
      </div>
    {/each}
  </div>
</div>
