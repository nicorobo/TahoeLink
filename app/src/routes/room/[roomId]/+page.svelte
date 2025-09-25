<script lang="ts">
  import { page } from '$app/state'

  $: roomId = page.params.roomId // or roomId = $derived(page.params.roomId)
</script>

<h1>Room: {roomId}</h1>
<p>Welcome to room {roomId}</p>
