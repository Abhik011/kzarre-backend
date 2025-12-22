const router = require("express").Router();
const ctrl = require("../../controllers/system.controller");


router.get("/", ctrl.getConfig);

router.post("/general", ctrl.saveGeneral);
router.post("/maintenance", ctrl.saveMaintenance);
router.post("/action", ctrl.runAction);

module.exports = router;
