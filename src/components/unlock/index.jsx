import { Dialog, DialogContent, Slide } from '@material-ui/core'
import { Component } from 'react'

import Unlock from './unlock'

function Transition(props) {
  return <Slide direction="up" {...props} />
}

class UnlockModal extends Component {
  constructor(props) {
    super(props)
    this.state = {
      fullScreen: false,
    }
  }

  componentDidMount() {
    if (typeof window !== 'undefined') {
      this.setState({ fullScreen: window.innerWidth < 576 })
    }
  }

  render() {
    const { closeModal, modalOpen } = this.props
    const { fullScreen } = this.state

    return (
      <Dialog
        open={modalOpen}
        onClose={closeModal}
        fullWidth={true}
        maxWidth={'sm'}
        TransitionComponent={Transition}
        fullScreen={fullScreen}
      >
        <DialogContent>
          <Unlock closeModal={closeModal} />
        </DialogContent>
      </Dialog>
    )
  }
}

export default UnlockModal
