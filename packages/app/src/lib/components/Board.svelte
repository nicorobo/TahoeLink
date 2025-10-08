<script lang="ts">
  let { board, onClick } = $props()
  const getCellBorderClasses = (
    board: number[][],
    cell: number,
    x: number,
    y: number,
  ) => {
    if (cell < 0) return
    const classes = ['border-0']
    console.log(board, cell, x, y)
    if (x - 1 < 0 || board[x - 1][y] !== cell) {
      classes.push('border-l-2 border-l-black')
    }
    // TODO use board dimension constant
    if (x + 1 >= board.length || board[x + 1][y] !== cell) {
      console.log('adding border right')
      classes.push('border-r-2 border-r-black')
    }
    if (y - 1 < 0 || board[x][y - 1] !== cell) {
      classes.push('border-t-2 border-t-black')
    }
    // TODO use board dimension constant
    if (y + 1 >= board[x].length || board[x][y + 1] !== cell) {
      classes.push('border-b-2 border-b-black')
    }
    return classes.join(' ')
  }
</script>

<div class="inline-grid grid-flow-col grid-rows-10">
  {#each board as column, i}
    {#each column as cell, j}
      <button
        class={`w-10 h-10 ${cell > 0 ? 'bg-amber-400' : 'bg-white'} hover:bg-gray-300 active:bg-gray-400 border border-gray-100 ${getCellBorderClasses(board, cell, i, j)}`}
        onclick={() => onClick(i)}>
      </button>
    {/each}
  {/each}
</div>
