<!-- Sign-in, setup and invite pages: one calm column, nothing else. -->
<template>
  <div class="flex min-h-dvh flex-col bg-ground text-ink">
    <header class="flex items-center justify-between px-5 py-4 sm:px-8">
      <div class="flex items-center gap-2.5">
        <BrandMark class="size-7 text-ink" />
        <span class="text-lg font-bold tracking-tight">Arca</span>
      </div>
      <ThemeSwitch />
    </header>
    <main class="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-16">
      <div class="w-full max-w-sm">
        <slot />
      </div>
    </main>
  </div>
</template>
