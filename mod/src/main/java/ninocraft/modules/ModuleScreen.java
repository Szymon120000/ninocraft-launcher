package ninocraft.modules;

import net.minecraft.client.gui.DrawContext;
import net.minecraft.client.gui.screen.Screen;
import net.minecraft.client.gui.widget.ClickableWidget;
import net.minecraft.text.Text;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class ModuleScreen extends Screen {
    private static final int PANEL_W = 480;
    private static final int LIST_W = 252;
    private static final int DETAIL_W = 208;
    private static final int PANEL_TOP = 56;
    private static final int PANEL_BOTTOM_MARGIN = 40;
    private static final int HEADER_H = 46;
    private static final int ROW_H = 24;
    private static final int ROW_STEP = 28;
    private static final int OPT_STEP = 28;
    private static final int RADIUS = 16;
    private static final String VERSION = "1.1.0";

    private final Map<Module, PinkButton> toggleButtons = new HashMap<>();
    private final Map<Module, PinkButton> detailButtons = new HashMap<>();
    private final List<ClickableWidget> optionWidgets = new ArrayList<>();
    private Module selected;
    private boolean selectedDirty = true;

    private int panelX0() {
        return (width - PANEL_W) / 2;
    }

    private int listX0() {
        return panelX0() + 18;
    }

    private int detailX0() {
        return panelX0() + 18 + LIST_W + 12;
    }

    private int rowY(int i) {
        return PANEL_TOP + HEADER_H + 26 + i * ROW_STEP;
    }

    private int optY(int i) {
        return PANEL_TOP + HEADER_H + 62 + i * OPT_STEP;
    }

    private int optEndY() {
        Module m = selected;
        return optY(m == null ? 0 : m.getOptions().size());
    }

    public ModuleScreen() {
        super(Text.literal("NinoCraft Modules"));
    }

    @Override
    protected void init() {
        toggleButtons.clear();
        detailButtons.clear();

        int i = 0;
        for (Module m : ModuleManager.getModules()) {
            int y = rowY(i);
            i++;

            PinkButton toggle = new PinkButton(listX0(), y, LIST_W - 34, ROW_H,
                    Text.literal(m.getName()), m.isEnabled(), () -> {
                        m.setEnabled(!m.isEnabled());
                        PinkButton b = toggleButtons.get(m);
                        if (b != null) b.setActive(m.isEnabled());
                        ModuleManager.save();
                    });
            toggle.setAlignLeft(true);
            toggle.setRadius(12);
            toggleButtons.put(m, toggle);
            addDrawableChild(toggle);

            PinkButton detail = new PinkButton(listX0() + LIST_W - 28, y, 28, ROW_H,
                    Text.literal("\u2026"), m == selected, () -> {
                        selected = m;
                        selectedDirty = true;
                        for (Map.Entry<Module, PinkButton> e : detailButtons.entrySet()) {
                            e.getValue().setActive(e.getKey() == selected);
                        }
                    });
            detail.setRadius(12);
            detailButtons.put(m, detail);
            addDrawableChild(detail);
        }

        if (selected == null && !ModuleManager.getModules().isEmpty()) {
            selected = ModuleManager.getModules().get(0);
        }
        rebuildOptions();
    }

    private void rebuildOptions() {
        for (ClickableWidget w : optionWidgets) {
            remove(w);
        }
        optionWidgets.clear();
        if (selected == null) return;

        int i = 0;
        for (ModuleOption<?> o : selected.getOptions()) {
            int y = optY(i);
            i++;
            ClickableWidget w;
            if (o instanceof ModuleOption.BoolOption b) {
                w = new PinkButton(detailX0() + DETAIL_W - 58, y + 2, 48, 20,
                        Text.literal(b.get() ? "ON" : "OFF"), b.get(), () -> {
                            b.set(!b.get());
                            ModuleManager.save();
                            selectedDirty = true;
                        });
                ((PinkButton) w).setRadius(10);
            } else if (o instanceof ModuleOption.ChoiceOption c) {
                w = new PinkButton(detailX0() + DETAIL_W - 74, y + 2, 64, 20,
                        Text.literal(c.display()), false, () -> {
                            c.next();
                            ModuleManager.save();
                            selectedDirty = true;
                        });
                ((PinkButton) w).setRadius(10);
            } else if (o instanceof ModuleOption.FloatOption f) {
                double rel = (f.get() - f.getMin()) / (f.getMax() - f.getMin());
                w = new PinkSlider(detailX0() + DETAIL_W - 122, y + 2, 112, 20, Text.literal(o.getLabel()), rel) {
                    @Override
                    protected void updateMessage() {
                    }

                    @Override
                    protected void applyValue() {
                        f.setClamped(f.getMin() + (float) value * (f.getMax() - f.getMin()));
                        ModuleManager.save();
                    }
                };
            } else {
                continue;
            }
            optionWidgets.add(w);
            addDrawableChild(w);
        }
    }

    @Override
    public void render(DrawContext context, int mouseX, int mouseY, float delta) {
        int pX0 = panelX0();
        int pY0 = PANEL_TOP;
        int pY1 = height - PANEL_BOTTOM_MARGIN;
        int lX0 = listX0();
        int dX0 = detailX0();

        context.fill(0, 0, width, height, 0x88000000);

        if (selectedDirty) {
            rebuildOptions();
            selectedDirty = false;
        }

        Ui.shadow(context, pX0, pY0, pX0 + PANEL_W, pY1, RADIUS);
        Ui.fillRound(context, pX0, pY0, pX0 + PANEL_W, pY1, RADIUS, Ui.CREAM);
        Ui.fillRound(context, pX0, pY0, pX0 + PANEL_W, pY0 + HEADER_H, RADIUS, Ui.ROSE);
        context.fill(pX0, pY0 + HEADER_H - 14, pX0 + PANEL_W, pY0 + HEADER_H, Ui.ROSE);
        context.fill(pX0, pY0 + HEADER_H - 2, pX0 + PANEL_W, pY0 + HEADER_H, Ui.ROSE_DEEP);

        context.drawTextWithShadow(textRenderer, Text.literal("\u2665  NinoCraft Modules"), pX0 + 20, pY0 + 16, 0xFFFFFFFF);
        context.drawTextWithShadow(textRenderer, Text.literal("R-Shift / ESC to close"), pX0 + PANEL_W - 18 - textRenderer.getWidth("R-Shift / ESC to close"), pY0 + 18, 0xE6FFD9E2);

        int chipY = pY0 + HEADER_H + 12;
        context.fill(lX0, chipY + 3, lX0 + 4, chipY + 7, Ui.ROSE);
        context.drawTextWithShadow(textRenderer, Text.literal("MODULES"), lX0 + 10, chipY, Ui.INK_SOFT);
        context.fill(dX0, chipY + 3, dX0 + 4, chipY + 7, Ui.ROSE);
        context.drawTextWithShadow(textRenderer, Text.literal("SETTINGS"), dX0 + 10, chipY, Ui.INK_SOFT);
        if (selected != null) {
            context.drawTextWithShadow(textRenderer, Text.literal(selected.getName()),
                    dX0 + 10 + textRenderer.getWidth("SETTINGS") + 12, chipY, Ui.ROSE);
        }

        int selIdx = -1;
        int i = 0;
        for (Module m : ModuleManager.getModules()) {
            if (m == selected) selIdx = i;
            i++;
        }
        if (selIdx >= 0) {
            int y = rowY(selIdx);
            Ui.fillRound(context, lX0, y, lX0 + LIST_W, y + ROW_H, 12, 0x2EE8436B);
        }

        if (selected != null) {
            int i2 = 0;
            for (ModuleOption<?> o : selected.getOptions()) {
                int y = optY(i2);
                i2++;
                Ui.fillRoundStroke(context, dX0, y, dX0 + DETAIL_W, y + ROW_H, 8, 0x40FFB3C6, Ui.PAPER);
                context.drawTextWithShadow(textRenderer, Text.literal(o.getLabel()), dX0 + 10, y + 8, Ui.INK);
            }
            int dy = optEndY() + 6;
            Ui.fillRound(context, dX0, dy, dX0 + DETAIL_W, dy + 26, 8, 0xFFFFE9F0);
            context.fill(dX0, dy + 4, dX0 + 3, dy + 22, Ui.ROSE);
            context.drawTextWithShadow(textRenderer, Text.literal(selected.getDescription()), dX0 + 10, dy + 9, Ui.INK_SOFT);
        }

        context.fill(pX0 + 18, pY1 - 36, pX0 + PANEL_W - 18, pY1 - 35, 0x33E8436B);
        context.drawCenteredTextWithShadow(textRenderer, Text.literal("v" + VERSION + "  \u2665  made with love"), width / 2, pY1 - 27, Ui.INK_SOFT);
        context.drawCenteredTextWithShadow(textRenderer, Text.literal("Zoom key: C  \u00b7  hold or toggle"), width / 2, pY1 - 15, 0x80A37481);

        super.render(context, mouseX, mouseY, delta);
    }

    @Override
    public boolean shouldPause() {
        return false;
    }
}