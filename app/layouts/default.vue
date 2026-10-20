<template>
  <div class="flex min-h-dvh bg-ground text-ink">
    <AppSidebar class="hidden lg:flex" />
    <div class="flex min-w-0 flex-1 flex-col">
      <header class="sticky top-0 z-10 flex items-center gap-3 bg-ground/85 px-4 py-3 backdrop-blur lg:px-8">
        <div class="lg:hidden"><AppMobileNav /></div>
        <NuxtLink to="/" class="flex items-center gap-2 lg:hidden">
          <BrandMark class="size-6 text-ink" />
          <span class="font-bold tracking-tight">Arca</span>
        </NuxtLink>
        <div class="mx-2 hidden min-w-0 flex-1 sm:block lg:mx-0"><SearchTrigger /></div>
        <div class="ml-auto flex items-center gap-3">
          <ThemeSwitch />
          <AppUserMenu />
        </div>
      </header>
      <main class="px-4 pt-4 pb-24 lg:px-8">
        <slot />
      </main>
    </div>
    <ClientOnly>
      <!-- One dock, so notices and the upload panel stack instead of overlapping. -->
      <div
        class="pointer-events-none fixed right-4 bottom-4 z-30 flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-3 sm:right-6 sm:bottom-6"
      >
        <AppToasts />
        <DuplicateNotices />
        <UploadPanel />
      </div>
    </ClientOnly>
  </div>
</template>
