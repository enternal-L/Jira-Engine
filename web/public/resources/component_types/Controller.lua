Controller = {

	OnStart = function(self)
		math.randomseed(498)
	end,

	OnUpdate = function(self)
		if Application.GetFrame() % 10 == 0 then
			local new_actor = nil
			if math.random() > 0.5 then
				new_actor = Actor.Instantiate("falling_box")
			else
				new_actor = Actor.Instantiate("falling_circle")
			end
			local new_rb = new_actor:GetComponent("Rigidbody")

			local rand_x = math.random() * 6.0 - 3.0
			local rand_y = math.random() * 6.0 - 3.0
			new_rb.x = rand_x
			new_rb.y = -5 - rand_y
		end
	end
}

