export default {
    'landmark': function Adversary(actor) {
        return new Proxy(actor, {
            get(actor, name, proxy) {
                if (name === 'totalStress') {
                    return actor.system.resistance; 
                }

                if (name === 'effects') {
                    return actor.items.reduce((o, item) => {
                        return o.concat(item.transferredEffects);
                    }, []);
                }
                
                if (name === 'haunts') {
                    function isActiveResource(resource) {
                        const isActive = resource.system.active ?? true;
                        const isComplete = resource.system.complete ?? false;
                        return resource.type === "haunt" && isActive && !isComplete;
                    }
                    const class_ = actor.proxy.class;
                    const resources = [];
                    if (class_ !== undefined) {
                        resources.push(...class_.children.filter(isActiveResource))
                    }
                    resources.push(...actor.items.filter(isActiveResource));
                    return resources;
                }
                
                if (name === 'resources') {
                    function isActiveResource(resource) {
                        const isActive = resource.system.active ?? true;
                        const isComplete = resource.system.complete ?? false;
                        return resource.type === "resource" && isActive && !isComplete;
                    }
                    const class_ = actor.proxy.class;
                    const resources = [];
                    if (class_ !== undefined) {
                        resources.push(...class_.children.filter(isActiveResource))
                    }
                    resources.push(...actor.items.filter(isActiveResource));
                    return resources;
                }

                // Gear the book lists at a landmark (2026-09-29): active
                // equipment items, shown in their own panel when present
                if (name === 'equipment') {
                    return actor.items.filter(item => item.type === 'equipment' && (item.system.active ?? true));
                }
            }
        });
    }
}