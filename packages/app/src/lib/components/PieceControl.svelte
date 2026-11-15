<script lang="ts">
  import type { Shape } from '@tahoelink/shared'
  import { pieceState, roomState } from '$lib/state.svelte'

  const allShapes: Shape[] = ['L', 'O', 'T', 'I', 'S', 'Z']

  let { legalShapes, disabled }: { legalShapes: Shape[]; disabled?: boolean } = $props()

  // If the currently selected shape is no longer legal, switch to first legal shape
  $effect(() => {
    if (!legalShapes.includes(pieceState.shape) && legalShapes.length > 0) {
      pieceState.shape = legalShapes[0]
    }
  })

  const rotateLeft = () => {
    if (disabled) return
    pieceState.rotation -= 1
  }

  const rotateRight = () => {
    if (disabled) return
    pieceState.rotation += 1
  }

  const flip = () => {
    if (disabled) return
    pieceState.flip = !pieceState.flip
  }

  const selectShape = (shape: Shape) => {
    if (disabled) return
    if (legalShapes.includes(shape)) {
      pieceState.shape = shape
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (disabled || roomState.stage !== 'in-progress') return
    const k = e.key

    // Rotation
    if (k === 'ArrowLeft') {
      e.preventDefault()
      rotateLeft()
    } else if (k === 'ArrowRight') {
      e.preventDefault()
      rotateRight()
    }
    // Flip
    else if (k === 'r' || k === 'f') {
      e.preventDefault()
      flip()
    }
    // Number keys 1-6 to select legal shapes
    else if (k === '1') { e.preventDefault(); if (legalShapes.length >= 1) selectShape(legalShapes[0]) }
    else if (k === '2') { e.preventDefault(); if (legalShapes.length >= 2) selectShape(legalShapes[1]) }
    else if (k === '3') { e.preventDefault(); if (legalShapes.length >= 3) selectShape(legalShapes[2]) }
    else if (k === '4') { e.preventDefault(); if (legalShapes.length >= 4) selectShape(legalShapes[3]) }
    else if (k === '5') { e.preventDefault(); if (legalShapes.length >= 5) selectShape(legalShapes[4]) }
    else if (k === '6') { e.preventDefault(); if (legalShapes.length >= 6) selectShape(legalShapes[5]) }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="flex flex-col gap-2" onkeydown={handleKeydown} tabindex="-1" role="region" aria-label="Piece controls">
  <div class="flex gap-1">
    {#each allShapes as shape}
      <button
        class="btn min-w-[44px] min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        class:opacity-50={!legalShapes.includes(shape)}
        class:cursor-not-allowed={!legalShapes.includes(shape)}
        class:font-bold={pieceState.shape === shape}
        disabled={!legalShapes.includes(shape)}
        onclick={() => selectShape(shape)}
      >{shape}</button>
    {/each}
  </div>
  <div>
    <button class="btn min-w-[44px] min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none" onclick={rotateLeft} disabled={disabled ?? false}>⬅️</button>
    <button class="btn min-w-[44px] min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none" onclick={rotateRight} disabled={disabled ?? false}>➡️</button>
    <button class="btn min-w-[44px] min-h-[44px] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none" onclick={flip} disabled={disabled ?? false}>🔄</button>
  </div>
</div>