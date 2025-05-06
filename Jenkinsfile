pipeline {
  agent any

  environment {
    // Utilisation de credentials sécurisés
    IMAGE_NAME = "bibliotheque-auth"
    IMAGE_TAG = "latest"
    REGISTRY = "docker.io"
    KUBE_NAMESPACE = "bibliotheque"
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Install') {
      steps {
        dir('microservice-auth') {
          sh 'npm ci'
        }
      }
    }

    stage('Build') {
      steps {
        dir('microservice-auth') {
          sh 'npm run build'
        }
      }
    }

    stage('Test') {
      steps {
        dir('microservice-auth') {
          sh 'npm test -- --coverage'
        }
      }
    }

    stage('Docker Build & Push') {
      steps {
        withCredentials([usernamePassword(
          credentialsId: 'docker-credentials',
          usernameVariable: 'DOCKER_USERNAME',
          passwordVariable: 'DOCKER_PASSWORD'
        )]) {
          script {
            // Méthode sécurisée pour le login Docker
            sh '''
              docker login -u $DOCKER_USERNAME --password-stdin $REGISTRY <<< "$DOCKER_PASSWORD"
              docker build -t $REGISTRY/$DOCKER_USERNAME/$IMAGE_NAME:$IMAGE_TAG ./microservice-auth
              docker push $REGISTRY/$DOCKER_USERNAME/$IMAGE_NAME:$IMAGE_TAG
            '''
          }
        }
      }
    }

    stage('Deploy to K3s') {
      steps {
        withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
          sh '''
            kubectl config set-context --current --namespace=$KUBE_NAMESPACE
            kubectl apply -f k8s/bibliotheque-auth-deployment.yaml
            kubectl apply -f k8s/bibliotheque-auth-service.yaml
          '''
        }
      }
    }

    stage('Verify Deployment') {
      steps {
        retry(3) {
          timeout(time: 3, unit: 'MINUTES') {
            sh '''
              kubectl rollout status deployment/bibliotheque-auth \
                --namespace=$KUBE_NAMESPACE \
                --timeout=180s
            '''
          }
        }
      }
    }
  }

  post {
    failure {
      script {
        echo "Pipeline failed! Attempting rollback..."
        withCredentials([file(credentialsId: 'kubeconfig-k3s', variable: 'KUBECONFIG')]) {
          sh '''
            kubectl rollout undo deployment/bibliotheque-auth \
              --namespace=$KUBE_NAMESPACE || true
          '''
        }
      }
    }
    always {
      sh 'docker logout $REGISTRY || true'
    }
  }
}