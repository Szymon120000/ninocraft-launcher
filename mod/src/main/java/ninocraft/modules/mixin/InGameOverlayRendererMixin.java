package ninocraft.modules.mixin;

import net.minecraft.client.gui.hud.InGameOverlayRenderer;
import net.minecraft.client.render.command.OrderedRenderCommandQueue;
import ninocraft.modules.ModuleManager;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfo;

@Mixin(InGameOverlayRenderer.class)
public class InGameOverlayRendererMixin {
    @Inject(method = "renderOverlays", at = @At("HEAD"), cancellable = true)
    private void ninocraftFireless(boolean thickFog, float tickDelta, OrderedRenderCommandQueue queue, CallbackInfo ci) {
        var m = ModuleManager.byId("fireless");
        if (m != null && m.isEnabled()) {
            ci.cancel();
        }
    }
}