package ninocraft.modules.mixin;

import net.minecraft.client.render.Camera;
import net.minecraft.client.render.GameRenderer;
import ninocraft.modules.modules.ZoomModule;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(GameRenderer.class)
public class GameRendererMixin {
    @Inject(method = "getFov", at = @At("RETURN"), cancellable = true)
    private void ninocraftZoom(Camera camera, float tickDelta, boolean changingFov, CallbackInfoReturnable<Double> cir) {
        if (ZoomModule.INSTANCE.isActive()) {
            cir.setReturnValue(cir.getReturnValue() * ZoomModule.INSTANCE.getMultiplier());
        }
    }
}
