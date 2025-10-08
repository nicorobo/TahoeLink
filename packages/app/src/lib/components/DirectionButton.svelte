<script lang="ts">
  let { direction, onClick } = $props()
</script>

<button
  onclick={onClick}
  class="
    px-6 py-3
    bg-blue-600 hover:bg-blue-700 active:bg-blue-800
    text-white font-semibold
    border border-blue-600 hover:border-blue-700
    rounded-lg
    shadow-md hover:shadow-lg
    transition-all duration-200 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
    min-w-[60px]
    transform hover:scale-105 active:scale-95
  ">
  {direction}
</button>
