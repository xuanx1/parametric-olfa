// SCENT VESSEL — tweaks (React, mounted in #tweaks-root)
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "quality": "Studio",
  "reliefDepth": 1,
  "decor": 1,
  "turntableSpeed": 0.35,
  "backdrop": "#cdc9c1"
}/*EDITMODE-END*/;

function SVTweaks() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  React.useEffect(() => {
    if (window.__svApplyTweaks) {
      window.__svApplyTweaks({
        quality: t.quality,
        turntableSpeed: t.turntableSpeed,
        backdrop: t.backdrop,
        reliefDepth: t.reliefDepth,
        decor: t.decor,
      });
    }
  }, [t.quality, t.turntableSpeed, t.backdrop, t.reliefDepth, t.decor]);

  return (
    <TweaksPanel>
      <TweakSection label="Render" />
      <TweakRadio
        label="Quality"
        value={t.quality}
        options={['Draft', 'Studio', 'Showroom']}
        onChange={(v) => setTweak('quality', v)}
      />
      <TweakSlider
        label="Relief depth"
        value={t.reliefDepth}
        min={0}
        max={2.2}
        step={0.1}
        onChange={(v) => setTweak('reliefDepth', v)}
      />
      <TweakSlider
        label="Venetian decoration"
        value={t.decor}
        min={0}
        max={1}
        step={0.05}
        onChange={(v) => setTweak('decor', v)}
      />
      <TweakSlider
        label="Turntable speed"
        value={t.turntableSpeed}
        min={0.05}
        max={1.5}
        step={0.05}
        onChange={(v) => setTweak('turntableSpeed', v)}
      />
      <TweakSection label="Studio" />
      <TweakColor
        label="Backdrop"
        value={t.backdrop}
        options={['#cdc9c1', '#b7b3aa', '#9b988f', '#cfd4d6']}
        onChange={(v) => setTweak('backdrop', v)}
      />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<SVTweaks />);
