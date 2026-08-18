package ninocraft.modules;

public abstract class ModuleOption<T> {
    protected final String id;
    protected final String label;
    protected T value;

    public ModuleOption(String id, String label, T defaultValue) {
        this.id = id;
        this.label = label;
        this.value = defaultValue;
    }

    public String getId() { return id; }
    public String getLabel() { return label; }
    public T get() { return value; }
    public void set(T v) { value = v; }
    public abstract String display();

    public static class BoolOption extends ModuleOption<Boolean> {
        public BoolOption(String id, String label, boolean def) {
            super(id, label, def);
        }
        @Override
        public String display() { return value ? "ON" : "OFF"; }
    }

    public static class FloatOption extends ModuleOption<Float> {
        private final float min;
        private final float max;
        private final float step;

        public FloatOption(String id, String label, float def, float min, float max, float step) {
            super(id, label, def);
            this.min = min;
            this.max = max;
            this.step = step;
        }
        public float getMin() { return min; }
        public float getMax() { return max; }
        public float getStep() { return step; }
        public void setClamped(float v) {
            value = Math.round(Math.max(min, Math.min(max, v)) / step) * step;
        }
        @Override
        public String display() { return String.format("%.1f", value); }
    }

    public static class ChoiceOption extends ModuleOption<String> {
        private final String[] choices;

        public ChoiceOption(String id, String label, String def, String... choices) {
            super(id, label, def);
            this.choices = choices;
        }
        public String[] getChoices() { return choices; }
        public void next() {
            for (int i = 0; i < choices.length; i++) {
                if (choices[i].equals(value)) {
                    value = choices[(i + 1) % choices.length];
                    return;
                }
            }
            value = choices[0];
        }
        @Override
        public String display() { return value; }
    }
}
