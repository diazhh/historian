# Troubleshooting

## Widget no aparece / muestra blanco

| Causa | Solución |
|-------|----------|
| JS resource no se subió | Verificar: `GET /api/resource/js/{id}` |
| `templateHtml` no coincide con selector | `<historian-trend-viewer>` debe coincidir con `selector: 'historian-trend-viewer'` |
| `controllerScript` no llama init() | Debe tener `self.onInit = function() { self.ctx.$scope.historianWidget.init(); };` |
| Falta `[ctx]="ctx"` en templateHtml | Template: `<historian-trend-viewer [ctx]="ctx">` |
| Error en consola | F12 → Console → buscar errores SystemJS o Angular |

## No llegan datos al widget

| Causa | Solución |
|-------|----------|
| Entity Alias mal configurado | Dashboard → Edit → Entity Aliases → verificar resolución |
| Device sin telemetry | `GET /api/plugins/telemetry/DEVICE/{id}/values/timeseries?keys=PV` |
| Timewindow fuera de rango | Verificar que el rango cubre el período con datos |
| Tipo de widget incorrecto | Widget `static` no recibe datos automáticos → usar `timeseries` o `latest` |

## ctx es undefined

Verificar `@Input() ctx: WidgetContext` y `[ctx]="ctx"` en templateHtml.

## Atributos del Device-tag no se leen

| Causa | Solución |
|-------|----------|
| Scope incorrecto | Client attrs via MQTT = CLIENT_SCOPE. Verificar scope |
| Key inexistente | `GET /api/plugins/telemetry/DEVICE/{id}/values/attributes/CLIENT_SCOPE?keys=description,engUnits` |
| Device Profile incorrecto | Verificar Device Profile = "Tag" |

## Dashboard state no navega

1. Estado destino existe en Dashboard → Edit → States
2. `stateController.updateState()` recibe nombre exacto (case-sensitive)
3. Alias `selectedEntity` es tipo `stateEntity`

## Broadcast entre widgets no funciona

Broadcasts solo funcionan entre widgets del **mismo dashboard state**. Para persistir datos entre estados, usar `stateController.updateState()` con state params.

## Debug general

```typescript
ngOnInit() {
  console.log('=== WIDGET DEBUG ===');
  console.log('ctx:', this.ctx);
  console.log('datasources:', this.ctx.datasources);
  console.log('data:', this.ctx.data);
  console.log('settings:', this.ctx.settings);
  console.log('stateParams:', this.ctx.stateController?.getStateParams());
}
```
