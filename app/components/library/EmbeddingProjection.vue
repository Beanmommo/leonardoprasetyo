<script setup lang="ts">
import type { BulletLegendItemInterface } from '@unovis/ts'
import { BulletShape } from '@unovis/ts'
import {
  VisAxis,
  VisBulletLegend,
  VisScatter,
  VisXYContainer
} from '@unovis/vue'

interface EmbeddingVector {
  pageNumber: number | null
  chunkIndex: number
  projection: {
    x: number
    y: number
  } | null
}

interface EmbeddingPlotPoint {
  x: number
  y: number
  pageNumber: number | null
  chunkIndex: number
}

const props = defineProps<{
  vectors: EmbeddingVector[]
  model: string
  dimensions: number
  metric: string
}>()

const PAGE_COLORS = [
  'var(--ui-primary)',
  'var(--ui-info)',
  'var(--ui-success)',
  'var(--ui-warning)'
]

const plotData = computed<EmbeddingPlotPoint[]>(() => props.vectors.flatMap(vector => (
  vector.projection
    ? [{
        ...vector.projection,
        pageNumber: vector.pageNumber,
        chunkIndex: vector.chunkIndex
      }]
    : []
)))

const plottedPages = computed(() => Array.from(new Set(plotData.value.map(point => point.pageNumber)))
  .sort((left, right) => (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER)))

const pageColors = computed(() => new Map(plottedPages.value.map((page, index) => (
  [page, PAGE_COLORS[index % PAGE_COLORS.length]!] as const
))))

const modelLegendItems = computed<BulletLegendItemInterface[]>(() => [{
  name: `${props.model} · ${props.dimensions.toLocaleString()}D · ${props.metric}`,
  color: 'var(--ui-primary)',
  shape: BulletShape.Circle
}])

const pageLegendItems = computed<BulletLegendItemInterface[]>(() => plottedPages.value.map(page => ({
  name: page === null ? 'Page unknown' : `Page ${page}`,
  color: pageColors.value.get(page),
  shape: BulletShape.Circle
})))

const x = (point: EmbeddingPlotPoint) => point.x
const y = (point: EmbeddingPlotPoint) => point.y
const color = (point: EmbeddingPlotPoint) => pageColors.value.get(point.pageNumber) ?? PAGE_COLORS[0]!
const label = (point: EmbeddingPlotPoint) => `C${point.chunkIndex}`
const formatAxisTick = (tick: number | Date) => typeof tick === 'number' ? tick.toFixed(2) : ''
</script>

<template>
  <section class="embedding-projection mt-5 rounded-xl border border-default bg-default p-5">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <p class="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary">
          Embedding projection
        </p>
        <h3 class="mt-1 text-lg font-semibold text-highlighted">
          Semantic vector map
        </h3>
        <p class="mt-1 max-w-3xl text-sm text-muted">
          PCA projection of the normalized embeddings. Nearby points are more similar, but two dimensions only approximate the original space.
        </p>
      </div>
      <UBadge
        color="neutral"
        variant="soft"
        :label="`${plotData.length} plotted vector${plotData.length === 1 ? '' : 's'}`"
      />
    </div>

    <ClientOnly>
      <template v-if="plotData.length">
        <div class="mt-5 grid gap-4 lg:grid-cols-2">
          <div>
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Embedding model
            </p>
            <VisBulletLegend
              :items="modelLegendItems"
              label-max-width="min(30rem, calc(100vw - 11rem))"
            />
          </div>
          <div>
            <p class="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
              Source page
            </p>
            <VisBulletLegend :items="pageLegendItems" />
          </div>
        </div>

        <div
          class="mt-4 min-h-80"
          role="img"
          :aria-label="`${plotData.length} document chunk embeddings projected into two principal components and colored by source page`"
        >
          <VisXYContainer
            :data="plotData"
            :height="360"
            :padding="{ top: 20, right: 24, bottom: 50, left: 64 }"
          >
            <VisScatter
              :x="x"
              :y="y"
              :color="color"
              :label="label"
              :size="20"
              :stroke-width="2"
              stroke-color="var(--ui-bg)"
              label-color="var(--ui-text-muted)"
              cursor="pointer"
            />
            <VisAxis
              type="x"
              label="Principal component 1"
              :num-ticks="4"
              :tick-format="formatAxisTick"
            />
            <VisAxis
              type="y"
              label="Principal component 2"
              :num-ticks="4"
              :tick-format="formatAxisTick"
            />
          </VisXYContainer>
        </div>
      </template>

      <template #fallback>
        <USkeleton class="mt-5 h-96 rounded-lg" />
      </template>
    </ClientOnly>
  </section>
</template>

<style scoped>
.embedding-projection {
  --vis-font-family: var(--font-sans);
  --vis-axis-tick-color: var(--ui-border);
  --vis-axis-domain-color: var(--ui-border);
  --vis-axis-grid-color: var(--ui-border);
  --vis-axis-grid-opacity: 0.65;
  --vis-axis-label-color: var(--ui-text-muted);
  --vis-axis-tick-label-color: var(--ui-text-muted);
  --vis-dark-axis-tick-color: var(--ui-border);
  --vis-dark-axis-domain-color: var(--ui-border);
  --vis-dark-axis-grid-color: var(--ui-border);
  --vis-dark-axis-label-color: var(--ui-text-muted);
  --vis-dark-axis-tick-label-color: var(--ui-text-muted);
  --vis-legend-font-family: var(--font-sans);
  --vis-legend-label-color: var(--ui-text-muted);
  --vis-dark-legend-label-color: var(--ui-text-muted);
  --vis-scatter-hover-stroke-width: 3px;
}
</style>
