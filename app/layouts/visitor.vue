<!-- Share links: what's shared, nothing of the app around it. -->
<template>
  <div class="flex min-h-dvh flex-col bg-ground text-ink">
    <header class="flex items-center justify-between px-5 py-4 sm:px-8">
      <div class="flex items-center gap-2.5">
        <BrandMark class="size-7 text-ink" />
        <span class="text-lg font-bold tracking-tight">Arca</span>
      </div>
      <ThemeSwitch />
    </header>
    <main class="mx-auto w-full max-w-6xl flex-1 px-4 pt-4 pb-16 sm:px-8">
      <slot />
    </main>
  </div>
</template>
