<script lang="ts">
  import { page } from '$app/state'
  import { api } from '$lib/api'
  import { playerState } from '$lib/state.svelte'
  import PlayerSelectButton from './PlayerSelectButton.svelte'
  let roomId = $derived(page.params.roomId)
  const slots = [0, 1, 2, 3]

  const onJoin = async (requestedPlayerId: number) => {
    const res = await api.joinRoom({
      roomId: roomId ?? '',
      playerId: requestedPlayerId,
    })
    playerState.playerId = res.playerId
    playerState.playerIds = res.playerIds
  }

  const onLeave = async () => {
    const res = await api.leaveRoom({
      roomId: roomId ?? '',
    })
    playerState.playerId = null
    playerState.playerIds = res.playerIds
  }
</script>

<div class="flex items-center justify-center">
  <div class="flex flex-col gap-2 max-w-96">
    {#each slots as id}
      <PlayerSelectButton
        playerId={id}
        selected={id === playerState.playerId}
        disabled={id !== playerState.playerId &&
          playerState.playerIds.includes(id)}
        {onJoin}
        {onLeave} />
    {/each}
  </div>
</div>
